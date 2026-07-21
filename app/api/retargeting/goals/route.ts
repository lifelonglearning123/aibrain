import { NextResponse } from "next/server";
import { listGoals } from "@/lib/integrations/goal-engine";
import { ghlConfigForEntity } from "@/lib/integrations/ghl";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** List a brand's Goal Engine goals (for the enrol dropdown). */
export async function GET(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const entity = resolveEntity(new URL(req.url).searchParams.get("entity"));
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
  }
  if (access && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  const cfg = await ghlConfigForEntity(entity as EntityKey);
  if (!cfg.locationId) {
    return NextResponse.json({ ok: true, goals: [], error: "no_ghl_location" });
  }

  const result = await listGoals(cfg.locationId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
