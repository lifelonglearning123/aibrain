import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cred } from "@/lib/credentials";

/**
 * Goal Engine merge — the merged Brain reads Goal Engine's OWN Supabase project
 * directly (goals, campaigns, flows, locations, execution state), rather than
 * migrating that data across projects. This is the low-risk path to "one app":
 * live data and encrypted GHL tokens stay exactly where they already work.
 *
 * Service-role client — SERVER-SIDE ONLY. Never import into a client component.
 */
let _client: SupabaseClient | null = null;

export async function goalEngineDb(): Promise<SupabaseClient | null> {
  if (_client) return _client;
  const url = await cred("GOAL_ENGINE_SUPABASE_URL");
  const key = await cred("GOAL_ENGINE_SUPABASE_SERVICE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export async function goalEngineDbConfigured(): Promise<boolean> {
  const [url, key] = await Promise.all([
    cred("GOAL_ENGINE_SUPABASE_URL"),
    cred("GOAL_ENGINE_SUPABASE_SERVICE_KEY"),
  ]);
  return Boolean(url && key);
}
