# AI Brain — Self-Learning Design Spec

The brain learns from real interactions, remembers anonymised insights, and uses them to
make Social + Goal Engine better over time — always with your approval.

## Decisions (locked with Chao)

- **Learn from:** Signal call data · GoHighLevel emails/SMS · your own notes ("Teach the brain").
- **Autonomy:** **Draft-for-approval** — the brain proposes; a human approves. Never auto-publishes.
- **Anonymisation:** extract *patterns* (pain points, objections, phrases) — never store names,
  numbers, emails or raw transcripts long-term. Especially important for Signal (clients' data).
- **Cross-brand:** **fully open** — any lesson can inform any brand — but **lessons are re-written
  per brand** (share the *what*, keep each brand's *how*/voice). Guardrail: don't homogenise.
- **Transparency:** the **AI Insights** view shows what the brain has learned + proposed changes.
- **Signal access:** read-only key to Signal's own Supabase (`calls` table).

## How "learning" works (honest)

Not model retraining. Three engineered mechanisms:
1. **Accumulate** — ingest new calls/emails/notes on a schedule → grow a knowledge base.
2. **Feedback** — weight insights by outcome (bookings → sales), demote proxies that don't convert.
3. **Self-refine** — propose updates to brand voice / drafts / sequences (draft-for-approval).

## Goal hierarchy (what it optimises toward)

```
ULTIMATE:      Sales — Stripe £ revenue + GHL won opportunities
INTERMEDIATE:  Booked calls / qualified leads (GHL, Signal bookings)
MINI (Social): reach · likes → SAVES · SHARES · LINK-CLICKS → leads   (weight the right side)
MINI (GoalEng):delivered · OPENS → CLICKS · replies → APPOINTMENTS    (+ minimise opt-outs)
```
Mini-goals are leading indicators; the brain periodically checks they actually correlate with
sales and **demotes vanity metrics** that don't.

## Sources & signals

| Source | What we read | Key signal |
|---|---|---|
| **Signal** (`calls`) | summary · subject tag · direction · **booked_at** · client/agency | **call → booking** (built-in conversion) |
| **GoHighLevel** | email/SMS conversations, opens, clicks, appointments, won opps | intent → conversion |
| **Your notes** | free-text observations | your judgement |
| **Stripe** | revenue | the ultimate truth |

## Architecture

```
Signal calls ─┐
GHL convos   ─┼─► anonymise ─► extract insights (gpt-5.5) ─► KNOWLEDGE BASE ─► AI Insights (view)
Your notes   ─┘                                              (brand + shared)      │
                                                                                   ▼
                                          draft-for-approval ─► Social drafts · Goal Engine sequences
                                                    ▲                                   │
                                          outcomes (bookings/sales) ◄──────────────────┘  (feedback loop)
```

Storage (Supabase): `brand_knowledge` (insights, scope brand|shared), `brand_notes`
(teach-the-brain), `learning_runs` (audit). Signal read via its own Supabase, read-only.

## Build phases

- **Slice 1 (now):** Signal connector · knowledge schema · insight extraction · **AI Insights view**
  (shows learnings, "Run learning", "Teach the brain") · Signal in Settings/Connected-apps.
- **Slice 2:** inject knowledge into **Social** drafting + **Goal Engine** sequences (draft-for-approval).
- **Slice 3:** GHL email/SMS ingestion; feedback loop (weight by booking/sale correlation).
- **Slice 4:** schedule it (Vercel Cron) so it learns while you sleep; proxy-validation.

## Guardrails
- Draft-for-approval everywhere. Anonymised insights only. Every learned change logged
  (`learning_runs` + decision log) and reversible. Cross-brand insights adapted per brand.
