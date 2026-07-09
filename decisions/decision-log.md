# Decision Log

Append important decisions here so the brain (and future-you) remember *what* was decided and
*why*. Newest at top.

---

## 2026-07-07 — Social v1: AI drafting engine (from Chao's workflow ref)

- **Context:** Chao shared a Claude-Code+MCP social workflow (brand voice → Higgsfield images →
  Blotato multi-platform publish → schedule). Translated the *process* into our custom app:
  gpt-5.5 writes copy; image-gen + publishing become connectors.
- **Built (tool-agnostic core):** `lib/ai/openai.ts` (raw-fetch chat, `max_completion_tokens`,
  json_object, model `gpt-5.5`) + `lib/ai/draft.ts` (per-platform rules for 9 platforms; drafts
  tailored copy from brand voice). `/api/social/draft` (auth-guarded). `SocialComposer` client UI:
  brand select · brand-voice textarea (saved to localStorage per brand for now) · topic · platform
  chips · Draft-with-AI → per-platform previews. Registry + env for Blotato/Higgsfield (planned).
- **Verified:** build green (18 routes); `/dashboard/social` renders HTTP 200; draft API without a
  key returns graceful `openai_not_configured`; Connected-apps lists Blotato + Higgsfield.
- **Deliberately deferred (next slice, needs a tool decision):** publishing rail — **Blotato**
  (workflow's choice, 9 platforms, paid) vs **GHL social planner** (already in stack); image/
  carousel generation (Higgsfield/Nano Banana); server-side brand-voice storage + AI interview;
  scheduling via Vercel Cron. Didn't hand-roll Blotato's API blind (unverifiable) — wire it once the
  rail is chosen + key available.
- **To activate drafting live:** add `OPENAI_API_KEY` (model gpt-5.5).

### Added while Chao was away — brand-voice AI interview (tool-agnostic)
- `lib/ai/brand-voice.ts` (`interviewStep`) + `/api/social/brand-voice/interview` + `BrandVoiceInterview`
  component wired into the composer ("✨ Build with AI"): gpt-5.5 asks one question at a time, pushes
  back on vague answers, then writes the brand voice into the textarea. Mirrors the workflow's
  "Claude interviews you" step. Verified: build green (19 routes), social page shows the button,
  interview API returns graceful `openai_not_configured` without a key.
- **Pending Chao's answer (asked, awaiting):** publishing rail = Blotato vs GHL planner vs both;
  and whether to build Higgsfield image/carousel generation alongside publishing.

### Social publishing built — Blotato (Chao said "keep building"; defaulted to workflow's tool)
- **Researched the real Blotato API** (help.blotato.com) before coding — base
  `https://backend.blotato.com/v2`, header `blotato-api-key`, `GET /users/me/accounts`,
  `POST /posts` with `{post:{accountId,content:{text,mediaUrls,platform},target:{targetType}},
  scheduledTime?}` (content.platform === target.targetType). Our "x" → Blotato "twitter".
- **Built:** `lib/integrations/blotato.ts` (config, listAccounts, resolveAccountId w/ env override
  `BLOTATO_ACCOUNT__<PLATFORM>`, publishPost) + `/api/social/publish` (auth-guarded, fans out per
  platform, per-post results). Composer gained a **Publish to platforms** button + per-platform
  result badges; Social page shows drafting + publishing readiness dots.
- **Verified (bogus key):** build green (20 routes); publish API returns HTTP 200 with graceful
  per-post `no_connected_account` (no crash); Blotato shows Connected; both status dots render.
- **Note:** text posts suit X/LinkedIn/Facebook/Threads/Bluesky; IG/TikTok/YouTube/Pinterest
  require media → need the Higgsfield images slice. Scheduling (`scheduledTime`) supported by the
  connector; a scheduling UI + Vercel Cron are still to build.
- **To activate:** add `BLOTATO_API_KEY` + connect socials in Blotato. (GHL-planner alternative
  still offered if Chao prefers.)

### DECISION: publishing rail = GoHighLevel (Chao chose GHL over Blotato)
- **Why:** reuses the same per-brand GHL Private Integration Token + location already wired for
  Pipeline — no new tool/cost, posting is naturally per-brand. Trade-off: fewer platforms
  (FB/IG/LinkedIn/X/Google/TikTok/YouTube/Pinterest; NO Threads/Bluesky) and depends on which
  socials are connected in each GHL location's Social Planner.
- **Researched GHL v2 social API** first: `GET /social-media-posting/{locationId}/accounts`,
  `POST /social-media-posting/{locationId}/posts`, Bearer + `Version: 2021-07-28`. (Marketplace
  docs are JS-rendered so exact body not scrapeable — built on the well-known v2 shape.)
- **Built:** `lib/integrations/ghl-social.ts` (listSocialAccounts, resolveGhlAccountIds, createSocialPost
  — schedules `scheduleDate = now+2min` to publish shortly; x→twitter mapping). Rewired
  `/api/social/publish` to publish per selected **brand** via GHL. Composer sends `entity`; publish
  readiness is per-brand (`ghlBrands`). Registry: GHL note now mentions social; Blotato demoted to
  "optional alt". Blotato connector kept in repo (unused) as a fallback.
- **Verified (bogus GHL token):** build green (20 routes); social page shows "Publishing via
  GoHighLevel"; publish(macaws) → graceful per-post `no_connected_account`; publish(leonardo, no GHL)
  → `ghl_not_configured` (per-brand gating works).
- **Caveat to confirm on live GHL:** exact publish-now vs scheduled/draft semantics + the accounts
  response shape — isolated to `ghl-social.ts`, a quick tweak if the live account differs.
- **To activate:** the brand's GHL Private Integration needs the social-planner scope + socials
  connected in that location's Social Planner. Uses the same `GHL_TOKEN__<BRAND>`/`GHL_LOCATION__<BRAND>`.

### Social images — Higgsfield (also unlocks IG/TikTok/YouTube/Pinterest)
- **Researched the Higgsfield API** (apidog/cloud.higgsfield.ai): base `https://api.higgsfield.ai`,
  Bearer, async `POST /v1/generations` → `202 {id}` → poll `GET /v1/generations/{id}` until an
  output URL. Higgsfield hosts the image, so its URL feeds straight into the GHL post media.
- **Built:** `lib/integrations/higgsfield.ts` (`generateImage` = submit + poll ≤90s + defensive
  `extractUrl`; `dimsForAspect`; model via `HIGGSFIELD_MODEL`, host via `HIGGSFIELD_BASE_URL`).
  `/api/social/image` (auth-guarded, `maxDuration=120`). Composer gained an optional Image section
  (prompt + aspect + Generate → preview) whose URL is attached to `mediaUrls` on publish; publish
  route + `createSocialPost` now forward media. Social page shows an Images readiness dot.
- **Verified (bogus key):** build green (21 routes); social page shows "Images ready (Higgsfield)";
  image API fails fast + graceful (`http_521` in ~1s, no long poll). **Caveat:** got a Cloudflare
  521 from `api.higgsfield.ai` with a bogus key — the exact host/model/result-field names must be
  confirmed against a real key; all three are env/`extractUrl`-overridable so it's a config tweak,
  not a rewrite.
- **To activate:** `HIGGSFIELD_API_KEY` (+ optional `HIGGSFIELD_MODEL` / `HIGGSFIELD_BASE_URL`).
- **Still deferred:** true multi-image *carousels* (v1 = one image/post) and post *scheduling*
  (Vercel Cron; `scheduleDate` already plumbed through the connector).

## 2026-07-09 — Best-brain leap #2: Ask-your-data + FIRST LIVE RUN on real data

- **LIVE RUN (Chao authorised):** triggered the real learning + brief via the cron entry point
  (production code path, real creds/data). Result: 200 Signal calls → 15 shared insights; 41 brand
  insights; brief generated. **56 total insights (9 converts).** Brief nailed it: "£1.85m open pipeline,
  0 new deals in 7d, ~no recurring revenue"; flagged its OWN data gaps (lead source = "Unknown" for
  macaws+AI; macaws £0 rev = its Stripe key is TEST-mode; AI 100% win rate = artifact).
- **Built Ask-your-data:** `lib/ai/ask.ts` (`answerQuestion` — context = latest brief + full
  brand_knowledge, both fast DB reads → gpt-5.5 text answer, grounded/cites evidence) + `/api/ask`
  (auth) + `AskChat` chat UI + `/dashboard/ask` (sidebar Think → "Ask your data").
- **Real bug caught + fixed:** gpt-5.5 is a REASONING model — `chatText` at 1500 max_completion_tokens
  returned EMPTY answers (reasoning ate the budget). Bumped to 4000. Verified via live demo: sharp,
  specific answer citing real numbers + learned insights, recommended focusing macaws.ai (88% of open
  pipeline, £0 monetised).
- **Verified:** build green (~38 routes). Ask-your-data demonstrated end-to-end on real data.
- **Next best-brain leaps:** #3 preference capture (learn from approvals) · #4 fix senses (Signal
  bookings, FB/Google ad spend for real ROAS) · #5 evidence/confidence + climb autonomy ladder.

## 2026-07-09 — "Best AI brain" leap #1: Daily Brief (proactive home)

- **Strategy discussion** (in decision log for reference): the gap from good-app → best-brain is
  proactivity, reasoning, measured feedback, memory-of-you, and trust. Prioritised leaps: Daily Brief →
  Ask-your-data → preference capture → fix senses (Signal bookings, ad spend) → evidence/confidence.
- **Built Daily Brief:** now the app **home** (`/dashboard`). `lib/ai/brief.ts` gathers live data across
  all 3 brands (revenue · pipeline · marketing · QuickBooks · learned insights) → gpt-5.5 synthesises a
  structured brief (headline · needs-attention · per-brand · voice-of-customer · today-focus) → stored in
  `daily_briefs` (migration 0005). Pre-generated so it's instant: nightly (added to `/api/cron/learn`
  after learning) + on-demand (`/api/brief/generate`, auth-guarded). `BriefView`/`BriefControls`;
  sidebar "★ Daily Brief" top link.
- **Verified:** build green (~36 routes); brief route 401-guarded; home 307s; `daily_briefs` confirmed
  not-yet-created → home shows run-0005 prompt gracefully.
- **To activate:** run `supabase/migrations/0005_briefs.sql`, then "Generate now" (or wait for nightly).
- **Next brain leap:** Ask-your-data (agentic chat that reasons across all live data).

## 2026-07-09 — Self-learning Slice 4: scheduled learning (Vercel Cron) — LEARNING LOOP COMPLETE

- **Refactored** the learning logic into `lib/ai/learn-run.ts` (`runSharedPass` · `runBrandPass` ·
  `runLearningPass(entity)` · `runAllBrands`) — one place, used by both the manual button and cron.
  `/api/insights/learn` is now thin (auth → `runLearningPass`).
- **Cron:** `/api/cron/learn` (GET, `maxDuration=300`) runs shared pass + every brand; secured by
  `CRON_SECRET` (Vercel auto-sends `Authorization: Bearer <CRON_SECRET>`). `vercel.json` cron
  `0 3 * * *` (nightly). Env `CRON_SECRET` documented.
- **Verified:** build green (34 routes); cron 401s without/with wrong secret (no accidental paid run);
  manual route still user-gated. Did NOT trigger a live run (would spend OpenAI + write DB — needs Chao's OK).
- **Proxy-validation stance:** inherently handled — conversion = **GHL won-opps** (not likes), so the
  brain optimises toward deals, not vanity metrics. Full mini-goal→sales correlation (e.g. likes) needs
  social-analytics data = a later add.
- **To activate nightly:** deploy to Vercel + set `CRON_SECRET` in Vercel env (Chao drives Vercel).
  Locally, use the "Run learning" button. **The full self-learning loop (Slices 1–4) is now built.**

## 2026-07-09 — Self-learning Slice 3: GHL email/SMS ingestion + feedback loop

- **Built:** `ghl.ts` gained `fetchWonContactIds` (contacts with a WON opp = the conversion signal)
  + `fetchConversations` (recent email/SMS message bodies, anonymised, capped 30). `/api/insights/learn`
  now adds a **GHL brand pass**: pull conversations → extract insights → mark `converts=true` when the
  contact has a won opp → store scope='brand', source='ghl' (replace-per-run). Reuses `extractInsights`
  (booked=converted). AI Insights copy updated.
- **Feedback loop:** since Signal `booked_at` is empty, conversion is driven by **GHL won-opportunities**,
  and `getBrandKnowledge` already prioritises `converts=true` → Social + Goal Engine drafts now favour
  what actually converts.
- **Verified:** build green (33 routes); all 3 GHL tokens have the **Conversations scope** (live check
  PASS) so ingestion works without re-scoping.
- **Next (Slice 4):** schedule the learning pass via Vercel Cron (learn while you sleep) + periodic
  proxy-validation (check mini-goals still correlate with sales; demote vanity metrics).

## 2026-07-09 — Self-learning Slice 2: inject learnings into Social + Goal Engine

- **Verified Chao's setup:** migration 0004 tables all EXIST; Signal connected via Settings —
  **2,854 calls / 2,748 with summaries**; **0 booked_at** (no booking signal yet → `converts`
  weighting has no positives until Signal records bookings or we use GHL won-opps).
- **Built:** `lib/knowledge.ts` (`getBrandKnowledge` = shared + brand insights, converts-prioritised;
  `knowledgePrompt`). **Social**: `/api/social/draft` now injects the brand's learned insights into
  `draftPosts` (posts grounded in real pain points/objections/phrases). **Goal Engine**:
  `lib/ai/sequence.ts` + `/api/retargeting/draft-sequence` + `SequenceDrafter` on the Retargeting page
  — gpt-5.5 drafts a multi-step retargeting sequence from learned objections (draft-for-approval; user
  sets it up in Goal Engine). Both remain draft-for-approval.
- **Verified:** build green (33 routes); new route 401-guarded; retargeting page 307 (no crash).
- **To see it with real data:** log in → AI Insights → Run learning (populates knowledge from the
  2,748 summaries) → Social & Retargeting drafts then use it.
- **Next:** GHL email/SMS ingestion · feedback loop (weight by booking/sale; use GHL won-opps since
  Signal booked_at is empty) · Vercel Cron schedule.

## 2026-07-08 — Self-learning engine (Slice 1) + full design spec

- **Design locked** (see `SELF_LEARNING.md`): learn from Signal calls + GHL emails/SMS + notes →
  anonymised insight extraction → knowledge base (brand + shared) → improves Social + Goal Engine,
  **draft-for-approval**. Goal tiers: mini (weighted to saves/shares/clicks/leads · opens<clicks<
  appointments) → intermediate (leads/booked) → ultimate (Stripe £ + GHL won). Cross-brand **fully
  open, lessons re-written per brand**. Anonymised. Transparent (AI Insights view).
- **Signal grounded:** its `calls` table has summary · subject_tag · transcript · **booked_at**
  (built-in call→booking conversion signal) · client/agency, on its own Supabase. Access = read-only
  key to Signal's Supabase (`SIGNAL_SUPABASE_URL` + `SIGNAL_SUPABASE_SERVICE_KEY`); we read only
  anonymised fields (no caller numbers/names).
- **Built (Slice 1):** `lib/integrations/signal.ts` (read-only, anonymised) · `lib/ai/insights.ts`
  (gpt-5.5 extraction, PII-forbidden, converts flag) · migration `0004_learning.sql`
  (`brand_knowledge`/`brand_notes`/`learning_runs`, RLS authed-read + service-role writes) ·
  `/api/insights/learn` (Signal→shared insights, notes→brand insights, replace-per-run, logged) ·
  `/api/insights/note` (teach the brain) · rebuilt **AI Insights** view (transparency + Run-learning +
  Teach-the-brain, handles missing table gracefully) · Signal in Settings + Connected-apps + setup.sql.
- **Verified:** build green (31 routes); insights routes 401-guarded; insights page 307s (no crash);
  confirmed `brand_knowledge` not yet in DB → page shows the run-migration prompt.
- **To activate:** run `supabase/migrations/0004_learning.sql`; add Signal Supabase URL + key in Settings.
- **Next slices:** inject knowledge into Social + Goal Engine (draft-for-approval) · GHL email/SMS
  ingestion · feedback loop (weight by booking/sale) · schedule via Vercel Cron.

## 2026-07-08 — Live credential test + Higgsfield connector rebuilt

- **Live-tested every entered key** (read from `app_credentials` via service role; pass/fail only):
  ✅ OpenAI · GHL ×3 · Stripe(macaws) · Shotstack · Apify. ❌ Stripe AI + Leonardo (401 bad key) ·
  Goal Engine (URL missing) · Higgsfield (521).
- **Higgsfield 521 root cause:** the connector was built from an inaccurate third-party blog. Checked
  the **official SDK** (`@higgsfield/client`, github higgsfield-ai/higgsfield-js) → real API is
  **`platform.higgsfield.ai`**, auth **`Authorization: Key KEY_ID:KEY_SECRET`**, image
  `POST /v1/text2image/{model}` `{input:{prompt,aspect_ratio}}`, video `POST /v1/image2video/dop`
  (animates an image → we text2image first), poll `GET /requests/{id}/status` → `images[].url`/`video.url`.
- **Rewrote `lib/integrations/higgsfield.ts`** to that contract (aspect_ratio not width/height; routes
  updated; `/api/video/clip` maxDuration→300 since it now images-then-animates). Build green.
- **Verified:** the corrected host now responds (521 gone); auth returns **401 only because the stored
  key isn't in `KEY_ID:KEY_SECRET` form** (test detected no colon). So the fix is correct — user just
  needs to enter both parts joined by a colon. Settings label updated to say so.
- **Outstanding user actions:** Higgsfield key as `KEY_ID:KEY_SECRET`; re-copy Stripe AI + Leonardo keys;
  add Goal Engine URL.

## 2026-07-07 — Credentials from the website (in-app Settings)

- **Chao's ask:** enter all credentials from the website (not `.env.local`), incl. the 3 brands'
  GHL location IDs + auth tokens.
- **Built:** `app_credentials` table (migration 0003, RLS service-role-only — never reaches browser).
  `lib/credentials.ts` = `cred(name)` resolver (**DB value first, then env fallback**, 15s cache,
  cache-bust on save) + `saveCredentials`. **Settings page** (`/dashboard/settings`) +
  `CredentialsForm` (grouped fields; per-brand GHL token+location ×3, Stripe ×3, QuickBooks,
  Higgsfield, Shotstack, Apify, Goal Engine, OpenAI). Values are write-only (shows "set"/••••, never
  echoes the secret). `/api/settings/save` (auth-guarded). Sidebar → System → Settings.
- **Refactor:** every connector config is now **async** and reads via `cred()` — openai, stripe,
  ghl (+ghl-social), higgsfield, shotstack, apify, quickbooks, goal-engine, registry — and all
  ~20 call sites (pages + routes) now `await`. `.env.local` still works as fallback.
- **Verified:** build green (29 routes, 2× — after refactor and after Settings); `/dashboard/settings`
  renders all fields incl. the 3 GHL brand token+location pairs; async path intact (draft still
  returns `openai_not_configured`, social page still 200); save without Supabase → graceful
  `store_unavailable`.
- **To use the Settings page:** Supabase must be set up (run migration 0003) — otherwise use `.env.local`.

## 2026-07-07 — Marketing view + Apify (completes the "See" layer)

- **Built (GHL lead analytics):** `getBrandMarketing` in `ghl.ts` — reads GHL contacts (paginated,
  capped 1,000), groups by `source`, counts new-7d/30d + total. Marketing page: entity-aware stat
  cards (Leads 30d · New 7d · Top channel · Total) + per-brand table + leads-by-source bars for a
  single brand.
- **Built (Apify research — finally uses Chao's stack):** `lib/integrations/apify.ts` (`runResearch`
  via `POST /v2/acts/{actorId}/run-sync-get-dataset-items`, Bearer, returns dataset items;
  actor via `APIFY_ACTOR_ID`, default `compass~crawler-google-places`). `/api/marketing/research`
  (auth-guarded, `maxDuration=300`) + `ResearchPanel` (query → results, defensive field extraction).
- **Verified (bogus GHL + Apify):** build green (27 routes); marketing page renders stat cards +
  brand row + research panel; research API → graceful **`http_401`** in ~1s (correct Apify
  endpoint/format, bad key); Apify shows Connected.
- **SEE LAYER COMPLETE:** Revenue (Stripe+QuickBooks) · Pipeline (GHL) · Marketing (GHL + Apify).
- **To activate:** GHL tokens (metrics) + `APIFY_TOKEN` (+ optional `APIFY_ACTOR_ID`) for research.
- **Noted gap:** CPL/ROAS needs ad-spend (Facebook/Google Ads) — a later add.

## 2026-07-07 — Video v1: mixed storyboard (user clips + AI clips)

- **Requirement (Chao):** video must mix user-created + AI-created content.
- **Built:** storyboard composer (`components/VideoComposer.tsx`) — ordered **scenes**, each either
  an **AI clip** (Higgsfield text-to-video) or **Your clip** (paste a URL). Reorder/remove, per-scene
  `<video>` preview. AI clips are **async**: `submitVideo` → `/api/video/clip` returns a job id →
  client polls `/api/video/clip/status` (≤5 min) → hosted clip URL. Extended `higgsfield.ts` with
  `submitVideo`/`checkGeneration` (video model via `HIGGSFIELD_VIDEO_MODEL`). Video page shows an
  AI-clip readiness dot; user clips need no key.
- **Verified (no key):** build green (23 routes); `/dashboard/video` renders the storyboard +
  add-clip buttons; both clip endpoints return graceful `higgsfield_not_configured`.
- **DEFERRED — the assembly/render step** (stitch ordered clips → one MP4 with captions/music →
  publish via GHL). Genuinely needs a render tool; NOT built blind. Options to decide with Chao:
  a **video-render API** (Shotstack / Creatomate — JSON timeline → MP4) vs an ffmpeg worker/service.
- **To activate AI clips:** `HIGGSFIELD_API_KEY` (+ optional `HIGGSFIELD_VIDEO_MODEL`). Same host
  caveat as images (confirm `HIGGSFIELD_BASE_URL` on a real key).

### Video assembly BUILT — Shotstack (Chao chose Shotstack + "finish assembly")
- **Researched Shotstack API** first: `x-api-key` header, `POST /v1/render` (or `/stage/render`) with
  `{timeline:{tracks:[{clips}]}, output:{format:mp4,resolution:hd,aspectRatio}}`, id at
  `response.id`, poll `GET /v1/render/{id}` → `response.status`/`response.url`. **Smart clips**
  `start:"auto"`+`length:"auto"` stitch clips end-to-end without knowing their durations.
- **Built:** `lib/integrations/shotstack.ts` (submitRender/checkRender; env `SHOTSTACK_API_KEY`,
  `SHOTSTACK_ENV`). Async: `/api/video/render` (submit → id) + `/api/video/render/status` (poll).
  VideoComposer now has **Assemble into one video** → renders → final MP4 preview + download → a
  **Publish this video** block (caption + platform chips) that reuses `/api/social/publish`
  (GHL) with the MP4 as media. Video page shows an Assembly readiness dot.
- **Verified (bogus key):** build green (25 routes); video page shows "ready (Shotstack)" + assemble
  button; render submit → graceful **`http_403`** (a proper Shotstack auth rejection = endpoint/path/
  header CONFIRMED correct, only the key was fake); status endpoint graceful; Shotstack in
  Connected-apps.
- **FULL VIDEO PIPELINE now end-to-end:** storyboard (your clips + AI clips) → Shotstack assemble →
  GHL publish. **To activate:** `SHOTSTACK_API_KEY` (+ `HIGGSFIELD_API_KEY` for AI clips + GHL for publish).
- **Still optional later:** captions/music/transitions on the render, brand-templated intros/outros.

---

## 2026-07-07 — Pipeline view live (GoHighLevel, 3 agencies)

- **Built:** `lib/integrations/ghl.ts` — GHL v2 (LeadConnector) connector, one Private Integration
  Token + location per brand (env `GHL_TOKEN__<BRAND>` / `GHL_LOCATION__<BRAND>`). `getBrandPipeline`
  reads pipelines (stage names) + opportunities (paginated, capped 1,000) → new-7d, open count, open
  value, won/lost, win rate, and open-deals-by-stage. 15s AbortController timeout (fail fast).
- **Pipeline page:** entity-aware unified rollup across agencies — stat cards (New 7d · Open ·
  Pipeline value · Win rate) + per-brand table + stage bars for a single selected brand + not-
  connected note. Currency defaults GBP (`GHL_CURRENCY__<BRAND>` override).
- **Verified (bogus token):** build green (17 routes); `/dashboard/pipeline` renders HTTP 200,
  bogus token → graceful per-brand **Error** row (no crash); Connected-apps flips **GoHighLevel →
  Connected**.
- **To activate live:** create a Private Integration in each brand's GHL location → set token +
  location id in env. (A brand with several sub-accounts can be extended to multiple locations.)
- **Next remaining:** Social (GHL planner + AI draft) · Video (in-house). Then AI insights layer.

---

## 2026-07-07 — QuickBooks added to Revenue (OAuth2 per brand)

- **Built:** `lib/integrations/quickbooks.ts` — OAuth2 per company: `authorizeUrl`, `exchangeCode`,
  auto-`refreshTokens`, `getBrandFinancials` (Profit & Loss report → income/expenses/net for 30d).
  OAuth routes `/api/integrations/quickbooks/{connect,callback}`. Tokens stored in Supabase
  `oauth_connections` (migration 0002) with **RLS on + no policies** = service-role only, never
  reaches the browser (`lib/supabase/admin.ts` service client). Connect links per brand on the
  Connected-apps page (shown once client creds set).
- **Revenue page:** now merges Stripe (MRR/revenue) + QuickBooks (expenses/net) per brand; stat
  cards MRR · Revenue(30d) · Expenses(30d) · Net(30d) + breakdown table. Each metric labelled by
  source (no misleading blended net).
- **Verified (bogus creds):** build green (17 routes); `/api/integrations/quickbooks/connect?entity=macaws`
  307-redirects to the real Intuit consent URL with correct client_id/scope/redirect_uri/state;
  all 3 per-brand connect hrefs render; Revenue page renders HTTP 200 and degrades gracefully with
  no tokens (no crash). Full token-exchange/P&L parse needs real Intuit app + Supabase to test.
- **To activate live:** register an Intuit developer app (get client id/secret, add the redirect
  URI), set `QUICKBOOKS_*` env, set up Supabase, then Connect each brand from Connected apps.
- **Next:** Pipeline across the 3 GHL agencies · Social · Video.

---

## 2026-07-07 — Revenue view live (Stripe, per brand)

- **Built:** `lib/integrations/stripe.ts` — one Stripe account per brand via env
  (`STRIPE_KEY__MACAWS` / `_ARTIFICIAL_IGNORANCE` / `_LEONARDO`). Live fetch on page load (no DB
  yet): MRR from active subscriptions (interval-normalised), revenue-30d from succeeded charges
  (minus refunds), active-sub count. Stripe client `timeout:15s, maxNetworkRetries:1` so a
  blocked network fails fast. `lib/money.ts` for currency formatting.
- **Revenue page:** entity-aware (respects the brand switcher); stat cards + per-brand breakdown
  table + "not connected" note for brands without a key. Falls back to the connect-state when no
  keys set. `export const dynamic = "force-dynamic"`.
- **Verified:** build green (15 routes); with a bogus key, `/dashboard/revenue` renders HTTP 200,
  Stripe rejects the key and the page shows a graceful per-brand **Error** row (no crash);
  Connected-apps flips **Stripe → Connected** from the registry.
- **To activate live:** add a read-only Stripe **restricted key** per brand. Open q: confirm one
  Stripe account per brand vs a shared account (shared needs product/metadata split for per-brand).
- **Next:** QuickBooks (expenses/net/runway) · then Pipeline (3 GHL agencies) · Social · Video.

---

## 2026-07-07 — Pivot to HUB + first linked app (Goal Engine)

- **Why:** Chao noted the dashboards resembled GoHighLevel and wanted the Brain to *do* work
  (social, video, retargeting) and *link* his other apps. Confirmed direction: **action hub +
  linked apps**, not mainly a dashboard.
- **Hub IA:** sidebar regrouped into **See** (Pipeline/Revenue/Marketing) · **Do**
  (Retargeting/Social/Video) · **Think** (AI Insights) · **System** (Connected apps).
- **Linking model:** hub triggers/reads each app via a thin connector (one file per app). Data &
  results reflect automatically; only an app's *API-contract* change needs a connector edit.
  Explained to Chao (car dashboard/engine analogy).
- **Goal Engine link built (ready mode):** `lib/integrations/goal-engine.ts` calls its real
  contract `POST /api/enroll/<goalId>` with `x-enroll-secret`. Retargeting page + live enrol
  tester + `/api/integrations/goal-engine/enroll` (auth-guarded when Supabase is set). Connector
  **fails safe** → `{ok:false,error:'not_configured'}` until `GOAL_ENGINE_URL` +
  `GOAL_ENGINE_ENROLL_SECRET` are added. Integration **registry** drives the Connected-apps page.
- **Verified:** `npm run build` green (16 routes); dev server renders all new pages at HTTP 200;
  enrol API returns the graceful not_configured response.
- **To activate live:** Chao provides Goal Engine's URL + ENROLL_SECRET; his 3 brands map to
  Goal Engine goals/tenants.
- **Next:** Stripe revenue (SEE differentiation) · Social (GHL planner + AI draft) · Video (in-house).

---

## 2026-07-07 — Phase 0 built & verified

- **Built:** Next.js (App Router) app — login (Supabase magic link), auth middleware/guard,
  dashboard shell (dark sidebar + brand switcher + topbar), and the 4 view tabs
  (Pipeline · Revenue · Marketing · AI Insights) as styled empty states. Full Supabase schema
  (`supabase/migrations/0001_init.sql`) + seed for the 3 brands. `SETUP.md` walkthrough.
- **Stack landed on:** Next.js **16.2.10** (Turbopack) + React 19 + Tailwind v4 +
  @supabase/ssr. (npm needs `NODE_OPTIONS=--use-system-ca` on this machine.)
- **Verified:** `npm run build` green (11 routes, TS passes); dev server renders
  `/dashboard/*` and `/login` at HTTP 200 in demo mode (no Supabase needed to boot).
- **Kept `middleware.ts`** despite Next 16's `proxy` rename (deprecation is a warning only,
  valid through Next 16; renaming risked silently disabling auth).
- **Next:** Phase 1 — wire Stripe (per brand) → first live Revenue numbers.

---

## 2026-07-07 — Scoping answers captured

- **Leonardo** = another **brand/agency Chao owns** (own clients, pipeline, revenue). So 3 peer
  brands: macaws.ai · Artificial Ignorance · Leonardo.
- **GHL** = **several separate agency accounts** → app connects to each independently
  (one credential/Private-Integration token per agency), then iterates its sub-accounts/locations.
- **v1 scope = all four views:** leads & pipeline (all GHL) · revenue & MRR (Stripe+QuickBooks) ·
  marketing performance · AI insights + chat over data.
- **Logins** = Chao + small internal team (all-access now; architect for per-entity filtering).

---

## 2026-07-07 — Direction set: CUSTOM WEB APP (supersedes brain-first)

- **Architecture:** Custom web app — **Vercel + Supabase + Apify**, with **OpenAI `gpt-5.5`**
  as the AI insight layer. The markdown scaffold becomes the app's context/config layer.
- **Entities covered:** macaws.ai · Artificial Ignorance · Leonardo (3 brands).
- **First function:** Sales + Marketing.
- **Interface:** Web dashboard (login).
- **Confirmed tool stack:**
  - Revenue → **Stripe** + **QuickBooks**
  - CRM → **GoHighLevel** (multiple accounts — structure TBD)
  - Calendar → **Google, via GHL**
  - Comms → **IONOS webmail** + **WhatsApp**
  - Meetings → **Loom**
  - Knowledge → local files + GHL + email + Loom
- **Integration phasing (proposed):** Phase 1 = Stripe · GHL · QuickBooks (well-documented
  APIs, cover sales+revenue). Phase 2 = IONOS email · WhatsApp · Loom (trickier/limited APIs).
- **Open:** What is "Leonardo"? · GHL account structure? · v1 must-have views? · who logs in?

---

## 2026-07-07 — Scaffolded the AI Brain (brain-first approach, proposed)

- **What:** Created the AIOS folder structure (context / connections / references / decisions /
  skills) in `C:\python\aibrain`, seeded from prior context about Chao's business.
- **Why:** Fastest, least-technical path to value; a superset that still feeds a custom
  Vercel/Supabase dashboard later. Chose to scaffold rather than stall while awaiting answers.
- **Open:** Confirm (1) first business entity, (2) first function to prove, (3) tool stack per
  bucket, (4) preferred interface. See open questions in `CLAUDE.md` and `context/`.
