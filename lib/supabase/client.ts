import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

/** Supabase client for use in Client Components. */
export function createClient() {
  const { url, anonKey } = supabaseConfig();
  return createBrowserClient(url!, anonKey!);
}
