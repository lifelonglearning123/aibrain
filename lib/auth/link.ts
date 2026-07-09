import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Generates a passwordless sign-in link we can deliver ourselves (via GHL).
 *
 * Uses Supabase admin generateLink to mint a one-time token_hash, then points at
 * our own /auth/confirm route (which calls verifyOtp). We deliberately DON'T use
 * the returned action_link — that uses the implicit flow our PKCE callback can't
 * consume. Existing users get a magiclink; brand-new emails fall back to invite
 * (which creates the user).
 */
export async function generateSignInLink(
  email: string,
  origin: string,
  next = "/dashboard",
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  // We only use the minted token_hash and build our own /auth/confirm URL, so we
  // deliberately omit redirectTo (avoids a Supabase redirect-allowlist dependency).
  let type: "magiclink" | "invite" = "magiclink";
  let res = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (res.error || !res.data?.properties?.hashed_token) {
    type = "invite";
    res = await admin.auth.admin.generateLink({ type: "invite", email });
  }

  const tokenHash = res.data?.properties?.hashed_token;
  if (res.error || !tokenHash) return null;

  const params = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${origin}/auth/confirm?${params.toString()}`;
}
