import { NextResponse } from "next/server";
import { ingestRecaps } from "@/lib/loom-recaps";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const maxDuration = 300;

/** Owner-triggered manual sync of Loom recaps (backfill / on-demand). */
export async function POST() {
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.hasAccess) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!access.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await ingestRecaps({ limit: 12 });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
