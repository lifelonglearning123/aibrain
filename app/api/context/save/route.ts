import { NextResponse } from "next/server";
import { saveBrandProfile, type BrandProfile } from "@/lib/brand-profile";
import { PROFILE_FIELDS } from "@/lib/brand-profile";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess, canAccessBrand } from "@/lib/access";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";

/** Saves a business's context profile. Anyone with access to that brand may edit it. */
export async function POST(req: Request) {
  const configured = supabaseConfig().configured;
  const access = configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    entity?: string;
    profile?: Record<string, unknown>;
  };
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "specify a brand" }, { status: 400 });
  }
  if (access && !(await canAccessBrand(entity, access))) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  // Whitelist known fields only, trim, drop empties.
  const clean: BrandProfile = {};
  for (const f of PROFILE_FIELDS) {
    const v = body.profile?.[f.key];
    if (typeof v === "string" && v.trim()) clean[f.key] = v.trim().slice(0, 8000);
  }
  // Voice influences (array of preset keys) + optional custom voice.
  const inf = body.profile?.voiceInfluences;
  if (Array.isArray(inf)) {
    clean.voiceInfluences = inf.filter((x): x is string => typeof x === "string").slice(0, 12);
  }
  const cv = body.profile?.customVoice;
  if (typeof cv === "string" && cv.trim()) clean.customVoice = cv.trim().slice(0, 2000);

  const res = await saveBrandProfile(entity as EntityKey, clean);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
