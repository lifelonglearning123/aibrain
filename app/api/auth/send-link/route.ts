import { NextResponse } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { resolveEmailSenderEntity, sendSystemEmail } from "@/lib/integrations/ghl-email";
import { generateSignInLink } from "@/lib/auth/link";
import { signInEmailHtml } from "@/lib/email/templates";

/**
 * Sends the sign-in link through GoHighLevel. If no GHL sender is configured (or
 * anything fails), returns { fallback: true } so the login page can fall back to
 * Supabase's own magic-link email — sign-in never breaks.
 */
export async function POST(req: Request) {
  if (!supabaseConfig().configured) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "valid_email_required" }, { status: 400 });
  }

  // No GHL sender → let the client use Supabase's built-in email.
  if (!(await resolveEmailSenderEntity())) {
    return NextResponse.json({ ok: false, fallback: true });
  }

  const origin = new URL(req.url).origin;
  const link = await generateSignInLink(email, origin);
  if (!link) return NextResponse.json({ ok: false, fallback: true });

  const r = await sendSystemEmail({
    to: email,
    subject: "Your AI Brain sign-in link",
    html: signInEmailHtml(link),
  });
  if (!r.ok) return NextResponse.json({ ok: false, fallback: true, error: r.error });

  return NextResponse.json({ ok: true });
}
