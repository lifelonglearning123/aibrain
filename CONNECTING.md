# Connecting your apps — step by step

Plain-English guide to wiring every integration. No coding — you paste keys into a file.

## Two ways to enter credentials

1. **The Settings page (recommended)** — in the app, sidebar → **System → Settings**. Paste every
   key/token there (including each brand's GHL token + location ID) and click **Save**. They're
   stored securely in your database and read automatically. *Requires Supabase set up first
   (Settings → Save is disabled until then).*
2. **The `.env.local` file** — the manual option below. The app reads the database first, then
   falls back to `.env.local`, so either works.

The app always reads **database value first, then `.env.local`**. Use whichever you prefer.

## How connecting works (the 60-second version)

- Each app gives you an **API key** (a long password). You paste it into the **Settings page**, or
  into a file called **`.env.local`** in `C:\python\aibrain`.
- After adding/changing keys, **restart the app** (`npm run dev`) — it reads the file on start.
- The **Connected apps** page (in the sidebar under *System*) shows a green **Connected** badge
  for anything that's wired correctly. That's your check.
- **You don't need Supabase to see most things.** Stripe, GoHighLevel, Higgsfield, Shotstack,
  Apify, Goal Engine and AI drafting all work with just a pasted key. **Supabase is only needed
  for (a) team login on the live site and (b) QuickBooks.**

### First: create the file

In PowerShell, from `C:\python\aibrain`:

```powershell
Copy-Item .env.local.example .env.local
```

Open `.env.local` in Notepad, fill in the values below, save, then run `npm run dev`.
(For the **live Vercel site**, add the same names/values under **Vercel → your project →
Settings → Environment Variables** instead.)

Two connection styles:
- **Paste-a-key** — nearly everything below.
- **Click Connect** — only QuickBooks (you set 4 values, then click a Connect button in the app).

---

## 1. Foundation

### OpenAI — powers AI drafting, the brand-voice interview, (later) insights
- **Get it:** platform.openai.com → **API keys** → *Create new secret key*.
- **Set:**
  ```
  OPENAI_API_KEY=sk-...
  OPENAI_MODEL=gpt-5.5
  ```

### Supabase — team login (live site) + QuickBooks token storage
- **Get it:** supabase.com → **New project** → **Settings → API**. Copy *Project URL*,
  *anon public*, and *service_role*.
- **Set:**
  ```
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ```
- Then run the two SQL files in Supabase → **SQL Editor** (see `SETUP.md`): `0001_init.sql`,
  `0002_oauth.sql`, and `seed.sql`.
- *Skip this for now if you just want to see data locally.*

---

## 2. Money

### Stripe — Revenue view (MRR + revenue), **one key per brand**
- **Get it:** In **each brand's** Stripe account → **Developers → API keys → Create restricted
  key**. Give it **read** access to *Charges* and *Subscriptions* (read-only is safest).
- **Set** (one line per brand you have):
  ```
  STRIPE_KEY__MACAWS=rk_live_...
  STRIPE_KEY__ARTIFICIAL_IGNORANCE=rk_live_...
  STRIPE_KEY__LEONARDO=rk_live_...
  ```
- If one Stripe account covers all brands, just fill the one you use.

### QuickBooks — Revenue view (expenses + net), **OAuth "Connect" per brand**
- **Get it:** developer.intuit.com → **Create an app** (Accounting scope). From the app's *Keys*:
  copy **Client ID** + **Client Secret**. Under *Redirect URIs*, add exactly:
  `http://localhost:3000/api/integrations/quickbooks/callback` (and your live Vercel URL version).
- **Set:**
  ```
  QUICKBOOKS_CLIENT_ID=...
  QUICKBOOKS_CLIENT_SECRET=...
  QUICKBOOKS_ENVIRONMENT=production        # or: sandbox
  QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback
  ```
- **Then connect:** open **Connected apps** in the app → under *Connect QuickBooks companies*,
  click **Connect [brand]** → sign in to QuickBooks → done. (Needs Supabase set up first, to
  store the login token.)

---

## 3. CRM · Pipeline · Marketing · Social publishing — GoHighLevel

One GHL token per brand powers **four** things (Pipeline, Marketing, and Social publishing).

- **Get it:** In **each brand's GHL sub-account** → **Settings → Private Integrations** →
  *Create* a token. Give it scopes for **Contacts**, **Opportunities**, and **Social Planner**
  (read + write). Copy the token.
- **Location ID:** in that sub-account, **Settings → Business Info** (or copy it from the URL,
  the part after `/location/`).
- **Set** (per brand):
  ```
  GHL_TOKEN__MACAWS=...
  GHL_LOCATION__MACAWS=...
  GHL_TOKEN__ARTIFICIAL_IGNORANCE=...
  GHL_LOCATION__ARTIFICIAL_IGNORANCE=...
  GHL_TOKEN__LEONARDO=...
  GHL_LOCATION__LEONARDO=...
  # optional currency override (default GBP): GHL_CURRENCY__MACAWS=GBP
  ```
- **For Social publishing:** the socials (Facebook, Instagram, LinkedIn, etc.) must be connected
  *inside* that GHL location's **Social Planner** UI. The app posts through those.

---

## 4. Media (Social images + Video)

### Higgsfield — social images + AI video clips
- **Get it:** higgsfield.ai → dashboard → **API** section → create a key.
- **Set:**
  ```
  HIGGSFIELD_API_KEY=...
  # optional overrides:
  # HIGGSFIELD_MODEL=nano-banana-pro
  # HIGGSFIELD_VIDEO_MODEL=veo-3
  # HIGGSFIELD_BASE_URL=          (only if the API host differs)
  ```

### Shotstack — assembles video clips into one MP4
- **Get it:** dashboard.shotstack.io → copy your **API key** (there's a *production* and a
  *sandbox/stage* key — they're different).
- **Set:**
  ```
  SHOTSTACK_API_KEY=...
  SHOTSTACK_ENV=production        # or: stage
  ```

---

## 5. Research — Apify (Marketing view)

- **Get it:** console.apify.com → **Settings → API & Integrations** → copy your **API token**.
- **Set:**
  ```
  APIFY_TOKEN=...
  # which scraper to run (default = Google Maps/Places for local-business leads):
  # APIFY_ACTOR_ID=compass~crawler-google-places
  ```

---

## 6. Retargeting — Goal Engine (your own app)

- **Get it:** from your Goal Engine project's environment (Vercel → goal-engine project →
  Settings → Environment Variables → the `ENROLL_SECRET` value). The URL is your deployed app.
- **Set:**
  ```
  GOAL_ENGINE_URL=https://goal-engine.vercel.app
  GOAL_ENGINE_ENROLL_SECRET=...
  ```

---

## 7. Optional — Blotato (alternative social publisher)

Not needed — GoHighLevel is the default social publisher. Only if you'd rather use Blotato:
- **Get it:** blotato.com → settings → **API** → copy the key (include any trailing `=`).
- **Set:** `BLOTATO_API_KEY=...`

---

## Suggested order (fastest value first)

1. **OpenAI** → drafting + brand-voice interview work immediately.
2. **Stripe** (one restricted key per brand) → live Revenue numbers, no Supabase needed.
3. **GoHighLevel** (token + location per brand) → Pipeline + Marketing + Social publishing.
4. **Higgsfield + Shotstack** → images + video.
5. **Apify** → market/lead research.
6. **Supabase** → then **QuickBooks** (expenses/net) + team login for the live site.
7. **Goal Engine** → retargeting.

After each one, open **Connected apps** and check for the green **Connected** badge.
