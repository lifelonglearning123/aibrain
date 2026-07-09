import { NextResponse } from "next/server";
import { runResearch, apifyConfig } from "@/lib/integrations/apify";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Runs an Apify research actor for a query and returns dataset items. */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await apifyConfig()).configured) {
    return NextResponse.json({ ok: false, error: "apify_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ ok: false, error: "query_required" }, { status: 400 });
  }

  const result = await runResearch(query);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
