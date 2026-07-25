import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the SERVICE ROLE key. Bypasses RLS — use
 * ONLY in server code (API routes, executor, webhooks). Never import into a
 * client component. Tenant isolation for these paths is enforced in app code.
 */
let _admin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.GOAL_ENGINE_SUPABASE_URL;
  const key = process.env.GOAL_ENGINE_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase server env not set (GOAL_ENGINE_SUPABASE_URL / GOAL_ENGINE_SUPABASE_SERVICE_KEY).");
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
