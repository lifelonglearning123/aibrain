import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components / actions — anon key + the user's
 * session cookie, so `auth.getUser()` reflects who's logged in. Data reads/
 * writes still go through the service-role client (lib/db/server) with an
 * explicit tenant filter; this client is for AUTH only.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Record<string, unknown>),
            );
          } catch {
            // Called from a Server Component — cookie writes are handled in middleware.
          }
        },
      },
    }
  );
}
