import { NextResponse } from "next/server";
import { createUploadUrl } from "@/lib/media";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** Mint a signed URL the browser uploads a media file straight to. */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { entity?: string; filename?: string };
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
  }
  if (access && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }
  const filename = (body.filename ?? "clip.mp4").trim() || "clip.mp4";

  const result = await createUploadUrl(entity as EntityKey, filename);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
