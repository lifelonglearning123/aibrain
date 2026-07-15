import { NextResponse } from "next/server";
import { draftBrandProfile } from "@/lib/ai/draft-profile";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess, canAccessBrand } from "@/lib/access";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";

export const maxDuration = 60;

/** AI-drafts a business's context profile from what the brain already knows. */
export async function POST(req: Request) {
  const configured = supabaseConfig().configured;
  const access = configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { entity?: string };
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "specify a brand" }, { status: 400 });
  }
  if (access && !(await canAccessBrand(entity, access))) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  const result = await draftBrandProfile(entity as EntityKey);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
