import { NextResponse } from "next/server";
import { runLearningPass, runBrandOnlyPass } from "@/lib/ai/learn-run";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const maxDuration = 300;

/** Manual learning pass (from the AI Insights "Run learning" button). */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { entity?: string };
  const entity = resolveEntity(body.entity);

  // Owners (or unconfigured/demo) get the full pass incl. the shared portfolio
  // learning. Partners only ever learn within their own companies.
  if (!access || access.isOwner) {
    const result = await runLearningPass(entity === ALL ? "all" : entity);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (entity !== ALL && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }
  const targets = entity === ALL ? access.brands : [entity as EntityKey];
  const result = await runBrandOnlyPass(targets);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
