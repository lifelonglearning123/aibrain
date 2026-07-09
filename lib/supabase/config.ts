/** Reads Supabase env config. NEXT_PUBLIC_* vars are safe on the client. */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}
