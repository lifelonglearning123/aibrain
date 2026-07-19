import { NextResponse } from "next/server";
import { listMedia, deleteMedia, mediaBackend } from "@/lib/media";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

async function guard(entityRaw: string | null) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) return { error: "unauthorized", status: 401 as const };
  const entity = resolveEntity(entityRaw);
  if (entity === ALL) return { error: "brand_required", status: 400 as const };
  if (access && !access.brands.includes(entity as EntityKey)) {
    return { error: "forbidden_brand", status: 403 as const };
  }
  return { entity: entity as EntityKey };
}

/** List a brand's uploaded media. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const g = await guard(searchParams.get("entity"));
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const [items, backend] = await Promise.all([listMedia(g.entity), mediaBackend()]);
  return NextResponse.json({ ok: true, items, ...backend });
}

/** Delete one media file from a brand's library. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const g = await guard(searchParams.get("entity"));
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const name = (searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  const result = await deleteMedia(g.entity, name);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
