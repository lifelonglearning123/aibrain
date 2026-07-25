import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key) — used by the sign-in / sign-up pages. */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
