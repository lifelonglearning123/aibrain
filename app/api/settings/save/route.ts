import { NextResponse } from "next/server";
import { saveCredentials, credentialStoreAvailable } from "@/lib/credentials";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** Saves credentials entered on the Settings page. Owner-only. */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.hasAccess)
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!access.isOwner)
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!credentialStoreAvailable()) {
    return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { values?: Record<string, string> };
  const values = body.values ?? {};
  if (typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json({ ok: false, error: "invalid_values" }, { status: 400 });
  }

  const ok = await saveCredentials(values);
  return NextResponse.json({ ok });
}
