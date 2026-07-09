# Connections Map — the 7 Data Buckets (CONFIRMED STACK)

Direction: **custom web app** (Vercel + Supabase + Apify) with **OpenAI `gpt-5.5`** for AI
insights. Each source below becomes an integration that syncs into Supabase, surfaced on a web
dashboard. Keys live in Vercel/Supabase env vars (never committed).

Legend — Status: ⬜ not built · 🟨 in progress · ✅ live · Difficulty: 🟢 easy · 🟡 medium · 🔴 hard/limited

| # | Bucket | Tool | API notes | Difficulty | Phase | Status |
|---|---|---|---|---|---|---|
| 1 | Revenue | **Stripe** | Live per-brand fetch (MRR from subs, revenue from charges) | 🟢 | 1 | 🟨 built; add key per brand |
| 1 | Revenue | **QuickBooks** | OAuth2 per brand; P&L → expenses/net; tokens in Supabase | 🟡 | 1 | 🟨 built; needs Intuit app + OAuth |
| 2 | Customer/CRM | **GoHighLevel** (×N accounts) | v2 PIT per brand; opportunities → pipeline rollup | 🟡 | 1 | 🟨 built; add token+location |
| 3 | Calendar | **Google via GHL** | Pull from GHL calendars API (not Google direct) | 🟡 | 1 | ⬜ |
| 4 | Comms | **IONOS webmail** | IMAP/SMTP poll — needs mailbox creds | 🟡 | 2 | ⬜ |
| 4 | Comms | **WhatsApp** | Needs WhatsApp Business Cloud API / Twilio / via GHL | 🔴 | 2 | ⬜ |
| 6 | Meetings | **Loom** | Limited public API; mostly links/embeds, transcripts on higher plans | 🔴 | 2 | ⬜ |
| 7 | Knowledge | local + GHL + email + Loom | Aggregated from the above + local file ingest | 🟡 | 2 | ⬜ |

> Note: bucket 5 (Tasks/PM) wasn't named — task/pipeline tracking currently lives in **GHL**.

## Entities (multi-brand)

The dashboard is multi-entity from day one: **macaws.ai · Artificial Ignorance · Leonardo.**
Every synced record is tagged with its entity so views can be filtered per brand or rolled up.
(Leonardo's nature — brand / product / client — TBD; see open questions.)

## Linked apps (your own engines — the hub model)

The Brain is a **command center** that triggers and reads your own apps, not just SaaS tools.
Each links via a thin connector (`lib/integrations/<app>.ts`) — one file per app, so a change
to the app only means updating that connector if its API *contract* changes.

| App | Role | Link surface | Connector | Status |
|---|---|---|---|---|
| **Goal Engine** | AI retargeting into GHL | `POST /api/enroll/<goalId>` (x-enroll-secret) + `/api/convert/<goalId>` | `lib/integrations/goal-engine.ts` | 🟨 connector built; needs URL + secret |
| Social poster | Publish posts | GHL social planner API (planned) | — | ⬜ |
| Video pipeline | Generate videos | in-house AI video tooling | — | ⬜ |

Data/results flow up automatically; only a change to an app's API contract needs a connector edit.

## Stack roles

- **Supabase** — Postgres store for synced data + auth + row-level security (per entity).
- **Vercel** — hosts the Next.js dashboard + **Cron** jobs for scheduled data refresh.
- **Apify** — called for growth/marketing research: lead scraping, competitor & market monitoring.
- **OpenAI `gpt-5.5`** — insight layer: summaries, recommendations, chat-over-your-data.

## Build phasing

- **Phase 1 (Sales + Marketing MVP):** Stripe · GHL (leads/pipeline/calendar) · QuickBooks →
  unified pipeline + revenue views + first AI insights. Scheduled nightly refresh + "refresh now".
- **Phase 2:** IONOS email · WhatsApp · Loom · local knowledge ingest.

## Open questions (block architecture)

1. **Leonardo** — what is it (brand you own / product / client / JV)?
2. **GHL structure** — one agency with many sub-accounts, or several separate agencies? How many?
3. **v1 must-have views** — pipeline / revenue / marketing performance / AI chat?
4. **Logins** — just you, internal team, or clients later?
