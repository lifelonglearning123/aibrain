import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { systemHasOwner } from "@/lib/access";

/**
 * Lockout recovery: a signed-in user claims the master owner account — but ONLY
 * when no owner exists yet. Re-verified server-side so a partner can never use it
 * to escalate once an owner is set.
 */
export async function POST() {
  if (!supabaseConfig().configured) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Authoritative guard: refuse if the system already has an owner.
  if (await systemHasOwner()) {
    return NextResponse.json({ ok: false, error: "owner_already_exists" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });

  const { error } = await admin
    .from("memberships")
    .upsert({ email, role: "owner", brands: [] }, { onConflict: "email" });
  return NextResponse.json({ ok: !error, error: error?.message });
}
