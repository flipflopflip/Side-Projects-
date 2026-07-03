# Marketing Memory AI — User Journeys

The product lives or dies on Journey 1. A user must reach "wow, it already knows my business" in the
first session, before any payment. Every design decision in onboarding serves that moment.

---

## Journey 1 — Signup → first "wow" (the activation path)

**Actor:** Restaurant owner, found us via a "AI that remembers your brand" ad.
**Goal:** From zero to a piece of on-brand content in under 10 minutes.

1. Landing page → **Sign up** (email + password, or Google OAuth). Email confirmation via Supabase Auth.
2. First login → forced **onboarding wizard** (no empty dashboard — an empty chat product is a churn
   machine):
   - Step 1: "What's your company called? What do you do?" → creates `org` + seeds `brand_profiles`.
   - Step 2: "Paste your website URL" → single-page scrape kicks off (async; wizard doesn't block).
     Skip allowed.
   - Step 3: "How should your marketing sound?" → 3–4 tone chips (warm/professional/playful/bold) +
     freeform box → `tone_of_voice`.
3. Wizard lands directly in **chat**, pre-filled suggestion: *"Write an Instagram post announcing our
   weekend special."*
4. The answer uses their restaurant's name, tone, and scraped menu details. **This is the wow.** The
   sources pill shows "based on: yoursite.com".
5. Empty-state nudges point at Knowledge ("Upload your menu PDF") and Brand ("Add words you never use").

**Failure modes designed against:** scrape fails → wizard proceeds, chat still personalizes from Step 1+3
answers; user skips everything → chat's first response asks one clarifying question and *saves the answer
to memory*, demonstrating the core loop instead of just suffering from the missing data.

---

## Journey 2 — Feeding the memory (knowledge upload)

**Actor:** Marketing agency account manager, onboarding a client into the tool.

1. Knowledge page → drag-drop 3 PDFs (brand guidelines, price list, FAQ). Each shows
   `processing → ready` status inline; errors are legible ("Couldn't extract text — is this a scanned
   PDF?").
2. Adds 5 URLs one at a time (client's homepage, services, about).
3. Brand page → fills writing rules: "Never say 'cheap', say 'affordable'", "British spelling".
4. Next chat: asks for a service-launch email. Output respects the price list and the writing rules.
5. Spot-checks the sources pill → sees the price list PDF cited → trusts the tool with the next client.

**Metric:** documents uploaded in week 1 correlates with retention; instrument it from day one.

---

## Journey 3 — Daily content generation (the retention loop)

**Actor:** Shopify store owner, 3rd week of use.

1. Opens chat (history in sidebar, grouped by recency). Types: "3 email subject lines for the
   spring sale — the one we discussed last week."
2. Retrieval pulls: the prior conversation's summary + the sale memory ("Spring sale: 20% off,
   Apr 1–14") + product chunks.
3. Output is on-brand without any re-explaining. User tweaks one line, replies "use 'blossom' not
   'bloom' in future" → clicks **Save to memory** on that correction.
4. Next week, "blossom" is just... used. The user never thinks about it again. **That invisible
   consistency is the retention loop.**

---

## Journey 4 — Correcting the memory (trust maintenance)

**Actor:** Any user whose AI said something off.

1. Assistant claims the shop opens Sundays (from a stale scraped page).
2. User: "We're closed Sundays now." Assistant acknowledges; the correction is saved (MVP: user clicks
   Save to memory; v1.1: auto-extracted as `pending_review`).
3. Memory page → user sees the fact, its provenance ("from chat, 12 Mar"), archives the stale one.
4. Knowledge page → deletes the outdated page, re-scrapes the URL.

**Design principle:** memory must be *visible and editable*, or one wrong answer destroys trust in all
answers.

---

## Journey 5 — Free → paid (the business)

**Actor:** Freelancer on the free tier.

1. Free tier: 20 messages/month, 5 documents, 1 org. Enough to hit the wow, not enough to run a business on.
2. At 80% usage: in-app banner + Resend email ("16 of 20 messages used").
3. At 100%: composer disabled with an upgrade card (history and knowledge stay readable — never hold
   data hostage; it's hostile and probably illegal in the EU).
4. Upgrade → Stripe Checkout (card-only, hosted page) → webhook flips `subscriptions.status` → composer
   unlocks on next page load.
5. Manage/cancel via Stripe Customer Portal link in Settings → Billing. We build **no** billing UI
   beyond two buttons.

**Pricing hypothesis (validate, don't marry):** Starter $29/mo (500 msgs, 50 docs) · Pro $79/mo
(2,000 msgs, 250 docs, priority support). Anchor against "an hour of a freelancer's time", not against
ChatGPT's $20.

---

## Journey 6 — Returning after a month away (memory as moat)

1. User returns after 5 weeks. Everything is exactly where they left it: conversations, brand voice,
   knowledge, memories.
2. First message picks up with full context — no "remind me what you do".
3. **This is the moat:** switching to ChatGPT means re-explaining the business forever; staying costs
   $29. Accumulated memory is the retention asset, which is why memory integrity (Journeys 2 & 4)
   outranks every flashy feature.
