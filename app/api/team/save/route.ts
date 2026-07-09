import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES } from "@/lib/entities";
import { generateSignInLink } from "@/lib/auth/link";
import { sendSystemEmail } from "@/lib/integrations/ghl-email";
import { inviteEmailHtml } from "@/lib/email/templates";

/** Owner-only: invite / update a partner (email → brands). */
export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    brands?: string[];
    role?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@"))
    return NextResponse.json({ ok: false, error: "valid_email_required" }, { status: 400 });

  const validKeys = new Set<string>(ENTITIES.map((e) => e.key));
  const brands = (Array.isArray(body.brands) ? body.brands : []).filter((b) => validKeys.has(b));
  const role = body.role === "owner" ? "owner" : "partner";

  // Is this a brand-new person? (only new invites get the welcome email)
  const { data: existing } = await admin
    .from("memberships")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  const isNew = !existing;

  const { error } = await admin
    .from("memberships")
    .upsert({ email, role, brands }, { onConflict: "email" });
  if (error) return NextResponse.json({ ok: false, error: error.message });

  // Send the welcome/invite email via GHL — non-fatal if it can't go out.
  let invited = false;
  let inviteError: string | undefined;
  if (isNew) {
    try {
      const origin = new URL(req.url).origin;
      const companies =
        role === "owner"
          ? "all companies"
          : brands.map((b) => ENTITIES.find((e) => e.key === b)?.name ?? b).join(", ") ||
            "the AI Brain";
      const link = await generateSignInLink(email, origin);
      const r = await sendSystemEmail({
        to: email,
        subject: "You've been given access to the AI Brain",
        html: inviteEmailHtml({ companies, link, loginUrl: `${origin}/login` }),
      });
      invited = r.ok;
      if (!r.ok) inviteError = r.error;
    } catch (e) {
      inviteError = e instanceof Error ? e.message : "invite_email_failed";
    }
  }

  return NextResponse.json({ ok: true, invited, inviteError });
}
