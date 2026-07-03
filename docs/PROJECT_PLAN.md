# Marketing Memory AI — Running Project Plan

> Living document. Updated at the end of every working session.
> Last updated: 2026-07-03 (design phase)

## Current status

**Phase:** Design complete, awaiting founder approval to start Sprint 1.
**Production URL:** — (not yet deployed)
**Next milestone:** Sprint 1 — Foundation (see `roadmap.md` §3)

## Key decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | Three-layer memory model (brand profile / knowledge base / learned memories) | Different data needs different injection semantics; see `architecture.md` §1 |
| 2026-07-03 | Next.js + Supabase only, no separate backend/queue | Solo-founder ops budget; revisit at scale triggers below |
| 2026-07-03 | Chat: `claude-opus-4-8`; background tasks: `claude-haiku-4-5`; prompt caching on brand block | Quality-first; Sonnet 5 is the recorded cost lever |
| 2026-07-03 | Embeddings: Voyage `voyage-3.5-lite`, `vector(1024)` | Anthropic has no embeddings API; dim frozen in schema |
| 2026-07-03 | MVP cuts: team seats, site crawler, auto memory extraction, admin dashboard, campaign objects | See `roadmap.md` §1 for promotion triggers |
| 2026-07-03 | Memory writes: explicit save (MVP), auto-extract + human confirm (v1.1) | Silent self-writing memory corrupts trust |

## Completed

- [x] Product architecture (`docs/architecture.md`)
- [x] Database schema v1 (`docs/architecture.md` §3)
- [x] Folder structure (`docs/architecture.md` §4)
- [x] User journeys (`docs/user-journeys.md`)
- [x] Roadmap + MVP scope + Sprint 1 plan (`docs/roadmap.md`)

## In progress

- (nothing — awaiting approval)

## Technical debt register

| Debt | Incurred | Pay down when |
|---|---|---|
| Synchronous ingestion in route handler (no job queue) | By design, Sprint 2 | Ingestion timeouts or >30s p95 → adopt Inngest/QStash |
| `personas`/`products` as JSONB blobs | By design, Sprint 1 | Any feature queries them individually → promote to tables |
| Single-URL scraper only | By design, Sprint 2 | Users routinely add >5 URLs → sitemap crawl (≤25 pages) |
| No hybrid (keyword+vector) search | By design, Sprint 3 | Retrieval misses on exact terms (SKUs, names) → add tsvector + RRF |
| Manual memory saves only | By design, Sprint 4 | v1.1: auto-extract with `pending_review` + confirm UI |

## Future enhancements (ordered backlog)

1. Auto memory extraction + review UI (v1.1)
2. Team seats & invites (agency segment)
3. Sitemap crawl, ≤25 pages
4. Sources pill UI in chat (data already stored per message)
5. Templates library ("Instagram post", "sale email", …)
6. Shopify integration (products → knowledge base)
7. Usage/analytics dashboard for users
8. Export conversations/content

## Open questions for the founder

1. Pricing: Starter $29 / Pro $79 hypothesis — gut-check against your target segment?
2. Free tier: 20 messages/month enough to reach the wow for your ICP, or should it be trial-based (14 days unlimited)?
3. First target segment for design partners: restaurants, Shopify stores, or freelancers? (Pick one for onboarding copy.)
