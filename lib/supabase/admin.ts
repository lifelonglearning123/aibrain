import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side writes and secret storage
 * (e.g. OAuth tokens). Bypasses RLS — NEVER import this into a Client Component.
 * Returns null until Supabase env vars are set.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
