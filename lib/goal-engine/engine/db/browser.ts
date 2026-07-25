import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client using the ANON key + Supabase Auth. RLS restricts
 * every query to the caller's tenant (via tenant_members). Safe for client
 * components / the dashboard.
 */
export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}
