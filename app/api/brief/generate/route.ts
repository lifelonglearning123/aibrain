import { NextResponse } from "next/server";
import { buildAndStoreBrief } from "@/lib/ai/brief";
import { openaiConfig } from "@/lib/ai/openai";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const maxDuration = 300;

/** Generates today's brief on demand (from the Daily Brief "Generate now" button). */
export async function POST() {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await openaiConfig()).configured) {
    return NextResponse.json({ ok: false, error: "openai_not_configured" }, { status: 400 });
  }

  try {
    // Owners (and demo mode) build the whole portfolio; partners only build and
    // receive their own company's brief.
    const isOwner = access ? access.isOwner : true;
    const brief = isOwner
      ? await buildAndStoreBrief()
      : await buildAndStoreBrief({ scope: access!.brands, portfolio: false });
    if (!brief) return NextResponse.json({ ok: false, error: "no_brief" }, { status: 502 });
    return NextResponse.json({ ok: true, brief });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "brief_failed" },
      { status: 500 },
    );
  }
}
