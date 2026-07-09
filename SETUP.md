# Setup — AI Brain (Phase 0)

Plain-English steps. You provision the accounts; the app reads from them. Nothing here
creates cloud resources on your behalf.

> Environment note: on your machine, npm sometimes needs the system certificate store.
> If `npm install` fails with an SSL/certificate error, prefix commands with
> `$env:NODE_OPTIONS="--use-system-ca";` in PowerShell.

## 1. Install dependencies

In PowerShell, from `C:\python\aibrain`:

```powershell
npm install
```

## 2. Run it locally (works before Supabase is set up)

```powershell
npm run dev
```

Open http://localhost:3000 — you'll see the dashboard in **demo mode** (an amber
"Supabase not connected" badge). The 4 view tabs and brand switcher all work; there's
just no data or login yet.

## 3. Create your Supabase project (enables login + data)

1. Go to https://supabase.com → **New project**. Pick a name (e.g. `ai-brain`) and a
   region close to you. Save the database password somewhere safe.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret — server only)

## 4. Load the database schema

In Supabase → **SQL Editor** → **New query**, run each of these in turn:
`supabase/migrations/0001_init.sql`, `0002_oauth.sql`, `0003_credentials.sql`, then
`supabase/seed.sql` (creates your 3 brands). `0003` enables the in-app **Settings** page where
you paste all your keys.

## 5. Add your keys locally

Copy the example env file and fill it in:

```powershell
Copy-Item .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=... (Project URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=... (anon public)
SUPABASE_SERVICE_ROLE_KEY=... (service_role)
```

Restart `npm run dev`. The amber badge disappears and `/login` now sends magic links.

## 6. Add your team

In Supabase → **Authentication → Users**, add each internal teammate's email (or they can
request a magic link from the login page — you can restrict sign-ups under
**Authentication → Providers → Email** later).

## 7. Deploy to Vercel (when you're ready)

I'll give you the exact commands to run yourself. You'll create the Vercel project, add
the same env vars under **Project → Settings → Environment Variables**, and set the
Supabase magic-link redirect URL to your Vercel domain
(**Supabase → Authentication → URL Configuration**).

---

## What's next (after Phase 0)

- **Phase 1 — Revenue:** connect Stripe (per brand), then QuickBooks. First live numbers.
- **Phase 2 — Pipeline:** connect the 3 GHL agencies.
- **Phase 3 — Marketing:** lead-source breakdown + Apify research.
- **Phase 4 — AI insights:** gpt-5.5 daily digest + ask-your-data chat.

See `connections/connections.md` for the full connection map and `decisions/decision-log.md`
for why things are built this way.
