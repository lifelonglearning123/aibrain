import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Owner-only: remove a partner's access. */
export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });

  const { error } = await admin.from("memberships").delete().eq("email", email);
  return NextResponse.json({ ok: !error, error: error?.message });
}
