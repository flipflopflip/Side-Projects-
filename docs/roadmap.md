# Marketing Memory AI — Roadmap, MVP Scope & Sprint 1 Plan

> Strategy: shortest credible path to a **paying customer**, then widen. Each sprint ends deployed to
> production and demoable. One sprint ≈ one focused week for a solo founder using Claude Code —
> calibrate against reality after Sprint 1 and re-plan.

---

## 1. MVP feature list (what ships before we ask for money)

**In:**

| Feature | Scope note |
|---|---|
| Auth | Email/password + Google OAuth (Supabase Auth) |
| Org + brand profile | 1 user per org; wizard + editable Brand page |
| Knowledge base | PDF upload (≤10 MB), single-URL scrape, pasted text; list + delete + re-ingest |
| RAG chat | Streaming, history, rolling summaries, sources stored per answer |
| Learned memory | Explicit save-to-memory + Memory page (view/add/archive) |
| Billing | Free tier limits → Stripe Checkout (Starter/Pro) → Customer Portal |
| Onboarding | 3-step wizard → seeded first chat |
| Transactional email | Confirm address, usage warnings (Resend) |
| Landing + pricing page | Enough to convert, not a design showcase |

**Out (explicitly, with the trigger that promotes them):**

| Cut feature | Why cut | Revisit when |
|---|---|---|
| Team invites / roles | Doubles auth+billing surface; ICP is solo operators & freelancers first | An agency asks for seats (they will) — schema already supports it |
| Full-site crawler | Engineering tarpit; single URLs cover onboarding | Users add >5 URLs manually per org |
| Auto memory extraction | Risky without a review UI | Sprint after launch (v1.1) — design already done |
| Brand voice learning from examples | Hard, fuzzy; explicit tone + rules gets 80% | Paying users say output "doesn't sound like us" despite a filled profile |
| Admin dashboard | Supabase Studio + Stripe Dashboard are the admin panel | Support volume makes SQL-by-hand painful |
| Campaign objects | A conversation *is* a campaign container for now | Users demand grouping/exports |
| Templates library ("write me a…") | Nice-to-have; chat covers it | Post-launch growth lever |

---

## 2. Development roadmap

### Sprint 1 — Foundation (deployable skeleton)
Scaffold, Supabase, auth, org creation, brand profile CRUD, deployed on Vercel.
**Demo:** sign up → onboarding wizard → edit brand profile → log out/in, data persists.

### Sprint 2 — Knowledge ingestion
Storage buckets, PDF parse, URL scrape, chunking, embeddings, `documents`/`document_chunks`,
Knowledge page with statuses.
**Demo:** upload a PDF + scrape a URL → chunks queryable in SQL with sane similarity results.

### Sprint 3 — RAG chat (the product)
`/api/chat` streaming route, retrieval, cache-aware prompt assembly, chat UI, conversation
history, titles + rolling summaries.
**Demo:** the Journey-1 wow — on-brand answer grounded in uploaded knowledge.

### Sprint 4 — Memory loop
`memories` table + retrieval, save-to-memory affordance, Memory page, memory injection into prompts.
**Demo:** correct the AI once → new conversation respects the correction.

### Sprint 5 — Billing & limits
Stripe products/prices, Checkout, webhook → `subscriptions`, usage counters + gates, pricing page,
usage-warning emails.
**Demo:** free user hits the wall → pays with a test card → unlocked.

### Sprint 6 — Polish & launch
Landing page, empty states, error states, mobile pass, onboarding friction pass, seed 5–10 design
partners.
**Demo:** a stranger signs up and reaches the wow with zero hand-holding.

**Post-MVP backlog (ordered):** auto memory extraction with review UI → team seats → sitemap crawl
(≤25 pages) → templates library → Shopify integration (pull products as knowledge — strong wedge for
that segment) → analytics dashboard.

---

## 3. Sprint 1 implementation plan (detailed)

Goal: production-deployed skeleton with auth, tenancy, and brand profile. No AI yet — Sprint 1 is
plumbing done right so Sprints 2–4 are pure product work.

| # | Task | Acceptance criteria |
|---|---|---|
| 1.1 | Scaffold: Next.js (App Router, TS strict), Tailwind, shadcn/ui, ESLint/Prettier, folder structure per `architecture.md` | `npm run build` clean; pushed to GitHub |
| 1.2 | Supabase project + local CLI; migration 0001: extensions, `orgs`, `profiles`, `org_members`, `brand_profiles`, `is_org_member`, RLS policies, signup trigger → `profiles` | `supabase db reset` applies cleanly; RLS verified by a cross-org read test in SQL |
| 1.3 | Supabase clients (`lib/supabase/{client,server,middleware}.ts`) + session-refresh middleware | Session survives reload; `(app)` routes redirect anonymous users to login |
| 1.4 | Auth pages: signup, login, logout, Google OAuth, email confirmation, password reset | Full round-trip works in prod, not just locally |
| 1.5 | Onboarding wizard: create org + `org_members(owner)` + seed `brand_profiles` in one server action (steps 1 & 3 only — scrape is Sprint 2, chip UI present but stores text) | New user is forced through wizard exactly once; lands on a placeholder chat page |
| 1.6 | Brand page: form (zod + server action) editing all `brand_profiles` fields incl. writing-rules list editor | Edits persist; second-account cross-org access blocked (verified) |
| 1.7 | App shell: sidebar nav (Chat, Knowledge, Brand, Memory, Settings — stubs), org name display, sign-out | Navigable skeleton, acceptable on mobile |
| 1.8 | Deploy: Vercel project, env vars, Supabase redirect URLs, `.env.example` documented | Signup→onboarding→brand-edit works on the production URL |

**Definition of done for the sprint:** a stranger can sign up on the prod URL, complete onboarding, edit
their brand profile, and *cannot* see anyone else's data — with the RLS test proving it, not vibes.

**Sprint 1 risks:** Supabase auth cookie handling in App Router (use `@supabase/ssr`, current docs —
this is the most-churned API in the stack); OAuth redirect config across local/preview/prod (set all
three redirect URLs on day one).

---

## 4. Working agreement (how we run each feature)

Per feature, in order: (1) why it exists → (2) design → (3) trade-offs → (4) code → (5) how to test →
(6) improvements → (7) **stop and wait for approval**. One milestone per session. `PROJECT_PLAN.md` is
updated at the end of every session: tasks done, debt incurred, enhancements deferred.
