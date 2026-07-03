# Marketing Memory AI — Architecture

> Status: v1 design, awaiting founder approval before any code is written.
> Companion docs: `user-journeys.md`, `roadmap.md`, `PROJECT_PLAN.md`.

## 1. What we're actually building

One sentence: **a chat product where the AI is permanently grounded in a company's brand knowledge.**

The differentiator is not the chat UI and not the LLM — it's the **memory system**. Everything in this
architecture is organized around one pipeline:

```
knowledge in  →  structured storage  →  retrieval at answer time  →  grounded generation  →  new memory out
```

If that pipeline is excellent, the product wins. Everything else (billing, teams, admin) is commodity.

### The three memory layers

This is the core design decision. "Memory" is not one thing — treating it as one thing (e.g. "just RAG
everything") produces a mediocre product. We use three layers, each with different storage, retrieval,
and injection behavior:

| Layer | What it holds | Storage | How it reaches the model |
|---|---|---|---|
| **1. Brand Profile** (structured facts) | Company name, description, tone of voice, writing rules, banned/preferred words, personas, products, offers | Normal relational rows / JSONB | **Always injected** into the system prompt, verbatim. Never retrieved — it must never be "missed" by a similarity search. |
| **2. Knowledge Base** (documents) | PDFs, scraped website pages, FAQs, blog posts, pasted text | `documents` + `document_chunks` with pgvector embeddings | **Retrieved per message** (vector search, top-k, filtered by org) and injected as cited context. |
| **3. Learned Memory** (evolving facts & preferences) | "Never use exclamation marks", "Summer sale runs June–Aug", "We call clients 'guests', not 'customers'", conversation summaries | `memories` table (short text rows + embeddings) | Small set: always injected. Large set: retrieved like layer 2. Written back after conversations. |

Why three layers instead of one vector store: the brand voice must apply to *every* output (retrieval can
miss), documents are too large to always inject (must be retrieved), and learned preferences need
provenance and user-editable lifecycle (a chunk in a PDF doesn't). Each layer has the storage its access
pattern demands.

### Grounding & citation rule

Requirement: *"Never invent company information. Always cite the stored source internally."*

Honest engineering position: **no prompt makes hallucination impossible.** What we can build is a system
where it's rare, detectable, and auditable:

1. Every retrieval result is injected with a source tag: `[src:chunk_uuid]`.
2. The system prompt instructs: factual claims about the company must come from provided context or the
   brand profile; if the context doesn't contain it, say so and ask, don't guess.
3. The chunk IDs + similarity scores used for each answer are stored on the `messages.sources` column.
   That gives us an audit trail ("what did the AI base this on?") and a future UI feature ("Sources" pill
   under each answer — strong trust signal, cheap to build since the data is already there).

---

## 2. System architecture

```
                           ┌──────────────────────────────────────────────┐
                           │                 Vercel                       │
                           │  Next.js (App Router, TypeScript)            │
                           │                                              │
   Browser ──────────────► │  ┌────────────┐   ┌───────────────────────┐  │
                           │  │ RSC pages / │   │ Route handlers        │  │
                           │  │ client comps│   │  /api/chat (stream)   │  │
                           │  └────────────┘   │  /api/ingest          │  │
                           │                   │  /api/webhooks/stripe │  │
                           │                   └──────────┬────────────┘  │
                           └──────────────────────────────┼───────────────┘
                                                          │
                ┌─────────────────────┬───────────────────┼──────────────────┐
                ▼                     ▼                   ▼                  ▼
        ┌──────────────┐      ┌──────────────┐    ┌────────────┐    ┌────────────┐
        │  Supabase    │      │  Anthropic   │    │ Embeddings │    │  Stripe    │
        │  Postgres    │      │  API (chat)  │    │ API        │    │  (billing) │
        │  + pgvector  │      │  streaming   │    │            │    │            │
        │  + Auth      │      └──────────────┘    └────────────┘    └────────────┘
        │  + Storage   │                                                 │
        └──────────────┘                              Resend ◄───────────┘ (emails)
```

Key properties:

- **No separate backend service.** Next.js route handlers + server actions are the entire backend.
  Supabase is the data plane (Postgres, auth, file storage, vector search). This is the right shape for a
  solo founder: one deploy target, one database, no queue infrastructure until usage forces it.
- **All AI calls are server-side.** API keys never reach the browser. Chat responses stream via SSE
  from `/api/chat`.
- **Row Level Security (RLS) everywhere.** Every tenant table carries `org_id`; policies enforce
  membership. This is the multi-tenancy boundary — not application code. Route handlers use the user's
  Supabase session client (RLS enforced); only the Stripe webhook and ingestion internals use the
  service-role client, and those code paths take `org_id` from trusted sources only.

### AI stack decisions (and why)

| Decision | Choice | Rationale |
|---|---|---|
| Chat model | `claude-opus-4-8` (Anthropic) | Best quality for brand-voice-sensitive generation; $5/$25 per MTok. Model ID lives in one config constant. **Cost lever:** if unit economics demand it post-launch, `claude-sonnet-5` ($3/$15, intro $2/$10 through Aug 2026) is a one-line swap — decide from real margin data, not upfront. |
| Cheap background model | `claude-haiku-4-5` | Conversation titles, summaries, memory extraction. $1/$5 per MTok — these tasks don't need frontier quality. |
| Thinking | `thinking: {type: "adaptive"}`, effort `low`–`medium` for chat | Marketing copy doesn't need deep reasoning per token; keep latency low. |
| Streaming | Always, via SSE (`messages.stream`) | Chat UX requirement; also avoids timeouts on long generations. |
| Prompt caching | `cache_control` breakpoint after the stable system prompt + brand profile block | The brand profile is re-sent on every message of every conversation — caching cuts that to ~0.1× input price. Keep the brand block byte-stable (no timestamps) or the cache never hits. |
| Embeddings | Voyage AI `voyage-3.5-lite`, **1024 dims** (Anthropic's recommended embeddings partner). Equivalent swap: OpenAI `text-embedding-3-small` at 1536 dims. | Anthropic has no embeddings endpoint. Dimension is baked into the DB schema (`vector(1024)`), so this is decided **now**, at migration time — changing later means re-embedding everything. |
| Vector index | pgvector HNSW, cosine distance | Good recall/speed at our scale; no index rebuild needed as data grows (unlike IVFFlat). |

### Ingestion pipeline (knowledge in)

```
PDF upload ──► Supabase Storage ──► parse (unpdf) ─┐
Website URL ──► fetch + extract (readability) ─────┼──► chunk (~800 tokens, 15% overlap)
Pasted text ───────────────────────────────────────┘         │
                                                             ▼
                                              embed (batched) ──► document_chunks
                                                             │
                                              documents.status = 'ready'
```

- **MVP runs this synchronously** in a route handler with `maxDuration` raised (Vercel allows up to
  800s on paid plans) and hard limits: 10 MB / ~100 pages per PDF, 1 URL per scrape request.
  `documents.status` (`pending → processing → ready | error`) makes the UI honest about progress.
- **Deliberately deferred:** background job queue (Inngest/QStash), full-site crawling, OCR for scanned
  PDFs. Logged as technical debt with explicit triggers in `PROJECT_PLAN.md`.
- **Scraper scope — pushback:** a "website scraper" that crawls whole sites is a tarpit (robots.txt,
  JS rendering, rate limits, infinite calendars). MVP scrapes **one URL at a time** (user pastes their
  homepage, about page, key product pages — a 2-minute onboarding task). "Crawl up to 25 pages from a
  sitemap" is a fast-follow, not MVP.

### Chat pipeline (retrieval + generation), per message

1. Auth + org check; subscription/usage gate.
2. Embed the user message (1 embeddings call).
3. In parallel: vector-search `document_chunks` (top 8, org-filtered, min similarity 0.3) and
   `memories` (top 5) via SQL functions.
4. Build the prompt:
   - System: product instructions + grounding rules (stable, cached) → brand profile block (stable per
     org, cached) → active always-inject memories.
   - Context block: retrieved chunks with `[src:id]` tags — placed in the user turn, after the cache
     breakpoint (it varies per message; must not poison the cache).
   - History: last N turns + rolling conversation summary when long.
5. Stream the response to the client.
6. After stream ends: persist assistant message with `sources`; fire-and-forget Haiku call for title
   (first message) and rolling summary (every ~10 messages); increment usage counter.

### Memory write-back (memory out)

Two mechanisms, shipped in this order:

1. **Explicit (MVP):** a "Save to memory" affordance on any message/selection, plus manual add/edit/
   archive in a Memory page. Users trust memory they can see and correct.
2. **Automatic (v1.1):** after a conversation, a Haiku pass extracts candidate preferences/facts
   ("user corrected tone: no emojis"). Candidates land with `source='auto_extracted'` and surface in the
   UI for one-click confirm/dismiss. **Pushback on "fully automatic":** silently self-writing memory is
   how you corrupt a brand profile with one sarcastic user message. Auto-*capture*, human-*confirm* is
   the right trade at this scale, and the review UI doubles as an engagement surface.

---

## 3. Database schema

Postgres (Supabase), pgvector extension. All timestamps `timestamptz`. Abridged to essentials — the
real migration adds `updated_at` triggers and indexes noted inline.

```sql
create extension if not exists vector;

-- ========== Tenancy ==========

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Mirrors auth.users (populated by trigger on signup)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- RLS helper used by every policy
create function is_org_member(check_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = check_org and user_id = auth.uid()
  );
$$;

-- ========== Memory layer 1: brand profile ==========

create table brand_profiles (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null unique references orgs(id) on delete cascade,
  company_name   text not null default '',
  description    text not null default '',        -- what the company does, for whom
  industry       text not null default '',
  website_url    text not null default '',
  tone_of_voice  text not null default '',        -- freeform: "warm, expert, plain-spoken"
  writing_rules  jsonb not null default '[]',     -- [{rule: "Never use exclamation marks"}]
  personas       jsonb not null default '[]',     -- [{name, description}] — promote to table when UI demands
  products       jsonb not null default '[]',     -- [{name, description, price?}] — same
  updated_at     timestamptz not null default now()
);

-- ========== Memory layer 2: knowledge base ==========

create table documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  source_type   text not null check (source_type in ('pdf', 'url', 'text')),
  title         text not null,
  source_url    text,                              -- for scraped pages
  storage_path  text,                              -- for uploaded files
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'ready', 'error')),
  error         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index documents_org_idx on documents (org_id, created_at desc);

create table document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  org_id       uuid not null,                      -- denormalized: RLS + fast filtered search
  chunk_index  int  not null,
  content      text not null,
  token_count  int  not null,
  embedding    vector(1024) not null               -- MUST match embedding model dims
);
create index chunks_embedding_idx on document_chunks
  using hnsw (embedding vector_cosine_ops);
create index chunks_org_idx on document_chunks (org_id);

-- ========== Chat ==========

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  title       text not null default 'New conversation',
  summary     text not null default '',            -- rolling summary for long chats
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  org_id           uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  sources          jsonb,                          -- [{chunk_id, score}] used for this answer
  created_at       timestamptz not null default now()
);
create index messages_convo_idx on messages (conversation_id, created_at);

-- ========== Memory layer 3: learned memory ==========

create table memories (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  kind             text not null check (kind in ('preference', 'fact', 'style', 'campaign')),
  content          text not null,                  -- one atomic statement
  embedding        vector(1024) not null,
  source           text not null default 'user_saved'
                   check (source in ('user_saved', 'auto_extracted')),
  status           text not null default 'active'
                   check (status in ('active', 'pending_review', 'archived')),
  conversation_id  uuid references conversations(id) on delete set null,  -- provenance
  created_at       timestamptz not null default now()
);
create index memories_org_idx on memories (org_id, status);

-- ========== Billing & usage ==========

create table billing_customers (
  org_id              uuid primary key references orgs(id) on delete cascade,
  stripe_customer_id  text not null unique
);

create table subscriptions (
  id                    text primary key,          -- Stripe subscription id
  org_id                uuid not null references orgs(id) on delete cascade,
  status                text not null,             -- trialing|active|past_due|canceled|...
  price_id              text not null,
  plan                  text not null,             -- 'starter' | 'pro'
  current_period_end    timestamptz not null,
  cancel_at_period_end  boolean not null default false,
  updated_at            timestamptz not null default now()
);

create table usage_counters (
  org_id        uuid not null references orgs(id) on delete cascade,
  period_start  date not null,                     -- first of month
  messages      int  not null default 0,
  documents     int  not null default 0,
  primary key (org_id, period_start)
);
```

**RLS pattern** (applied to every org-scoped table; billing tables are read-only for members and
written only by the service role via the Stripe webhook):

```sql
alter table documents enable row level security;
create policy documents_member_all on documents
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
```

**Retrieval function** (called via `supabase.rpc`, one per searchable table):

```sql
create function match_chunks(
  p_org_id uuid, p_query vector(1024), p_limit int default 8, p_min_sim float default 0.3
) returns table (chunk_id uuid, document_id uuid, content text, similarity float)
language sql stable as $$
  select c.id, c.document_id, c.content, 1 - (c.embedding <=> p_query)
  from document_chunks c
  where c.org_id = p_org_id
    and 1 - (c.embedding <=> p_query) > p_min_sim
  order by c.embedding <=> p_query
  limit p_limit;
$$;
```

Schema decisions worth flagging:

- **`personas`/`products` as JSONB, not tables.** For MVP they're read-as-a-blob, written-as-a-blob via
  the brand profile form. Promote to tables when a feature needs to query them individually (e.g.
  per-persona content generation). Recorded as intentional debt.
- **`org_id` denormalized onto `document_chunks` and `messages`.** Slightly redundant, but it makes RLS
  policies direct (no join) and keeps vector search to a single-table filtered scan. Worth it.
- **Seats are schema-ready, product-deferred.** `org_members` supports multiple members from day one so
  adding team invites later is a UI + email feature, not a migration. MVP ships single-user orgs.

---

## 4. Folder structure

Next.js App Router, `src/` layout, feature-first `lib/`:

```
marketing-memory-ai/
├── src/
│   ├── app/
│   │   ├── (marketing)/                # public
│   │   │   ├── page.tsx                # landing
│   │   │   └── pricing/page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── auth/callback/route.ts  # Supabase OAuth/magic-link callback
│   │   ├── (app)/                      # authenticated; layout checks session + org
│   │   │   ├── layout.tsx
│   │   │   ├── onboarding/page.tsx     # org + brand wizard (first login)
│   │   │   ├── chat/
│   │   │   │   ├── page.tsx            # new conversation
│   │   │   │   └── [conversationId]/page.tsx
│   │   │   ├── knowledge/page.tsx      # documents list, upload, scrape
│   │   │   ├── brand/page.tsx          # brand profile editor
│   │   │   ├── memory/page.tsx         # view/confirm/archive memories
│   │   │   └── settings/
│   │   │       ├── page.tsx            # org settings
│   │   │       └── billing/page.tsx
│   │   └── api/
│   │       ├── chat/route.ts           # POST — streams SSE
│   │       ├── ingest/route.ts         # POST — pdf/url/text ingestion
│   │       └── webhooks/stripe/route.ts
│   ├── components/
│   │   ├── ui/                         # buttons, inputs, dialog… (shadcn/ui)
│   │   ├── chat/                       # message list, composer, sources pill
│   │   ├── knowledge/                  # upload dropzone, document rows
│   │   └── brand/                      # profile form sections
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # browser client
│   │   │   ├── server.ts               # server client (cookies) + service-role client
│   │   │   └── middleware.ts           # session refresh
│   │   ├── ai/
│   │   │   ├── config.ts               # model ids, dims, limits — single source of truth
│   │   │   ├── prompt.ts               # system prompt assembly (cache-aware)
│   │   │   ├── retrieval.ts            # embed query + match_chunks/match_memories
│   │   │   ├── chat.ts                 # Anthropic streaming call
│   │   │   └── embeddings.ts           # batch embed
│   │   ├── ingestion/
│   │   │   ├── pdf.ts                  # parse
│   │   │   ├── scrape.ts               # fetch + extract single URL
│   │   │   ├── chunk.ts                # token-aware chunking
│   │   │   └── ingest.ts               # orchestrates parse→chunk→embed→store
│   │   ├── stripe/
│   │   │   ├── client.ts
│   │   │   └── plans.ts                # plan/price mapping + limits
│   │   ├── validation/                 # zod schemas shared by forms & API
│   │   └── usage.ts                    # limit checks + counters
│   ├── types/                          # DB row types (supabase gen types) + app types
│   └── middleware.ts
├── supabase/
│   ├── migrations/                     # SQL, checked in, applied via supabase CLI
│   └── config.toml
├── docs/                               # these documents
├── .env.example                        # every env var, documented, no secrets
└── package.json
```

Conventions: server components by default, `"use client"` only where interactive; all writes via server
actions or route handlers with zod validation; the browser never talks to Anthropic/Voyage/Stripe
directly; `lib/ai/config.ts` is the only place model names and vector dims appear.

---

## 5. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   # safe for browser (RLS enforced)
SUPABASE_SERVICE_ROLE_KEY                                  # server only — webhook + ingestion
ANTHROPIC_API_KEY
VOYAGE_API_KEY                                             # embeddings
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RESEND_API_KEY
NEXT_PUBLIC_APP_URL
```
