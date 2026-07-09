# Finish Supabase login (one-time, ~10 min)

You've added Supabase, so the dashboard now needs sign-in. Do these 4 steps once.
The app now always runs at **http://localhost:3006**.

## Step 1 — Create the database tables

1. Go to your Supabase project → **SQL Editor** → **New query**.
2. Open the file `supabase/setup.sql` (in this project), copy **everything**, paste it in.
3. Click **Run**. You should see "Success". (Safe to run again if unsure.)

This creates all tables + your 3 brands, and turns on the **Settings** page.

## Step 2 — Allow the login link to come back to the app

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL:** `http://localhost:3006`
3. **Redirect URLs:** click *Add URL* and add: `http://localhost:3006/**`
4. Save.

(While you're in **Authentication → Providers → Email**, make sure **Email** is
enabled and **"Allow new users to sign up"** is on — both are on by default.)

## Step 3 — Start the app and sign in

```powershell
$env:NODE_OPTIONS="--use-system-ca"; npm run dev
```

1. Open **http://localhost:3006/login**
2. Enter your email → **Send magic link**
3. Check your inbox (and **spam** — the first one often lands there) → click the link
4. It brings you back signed in, on the dashboard.

> Magic-link emails use Supabase's built-in sender, which is rate-limited (a few per
> hour). If it doesn't arrive, wait a minute and check spam. If email is a hassle, tell
> me and I'll switch you to a simple email + password login instead.

## Step 4 — Add the rest of your keys, the easy way

1. In the app: sidebar → **System → Settings**.
2. Paste your **3 GoHighLevel** tokens + location IDs, **Stripe** keys, etc. → **Save**.
3. Sidebar → **System → Connected apps** to see the green **Connected** badges.

That's it — you're fully live.
