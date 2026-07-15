import { NextResponse } from "next/server";
import { draftBrandProfile } from "@/lib/ai/draft-profile";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess, canAccessBrand } from "@/lib/access";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";

export const maxDuration = 60;

/** Builds a business's context profile from the owner's interview answers + live data. */
export async function POST(req: Request) {
  const configured = supabaseConfig().configured;
  const access = configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    entity?: string;
    answers?: { q?: unknown; a?: unknown }[];
  };
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "specify a brand" }, { status: 400 });
  }
  if (access && !(await canAccessBrand(entity, access))) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  const answers = Array.isArray(body.answers)
    ? body.answers
        .map((x) => ({ q: String(x?.q ?? "").trim(), a: String(x?.a ?? "").trim() }))
        .filter((x) => x.q && x.a)
        .slice(0, 20)
    : [];
  if (answers.length === 0) {
    return NextResponse.json({ ok: false, error: "no_answers" }, { status: 400 });
  }

  const result = await draftBrandProfile(entity as EntityKey, { answers });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
