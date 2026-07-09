import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";

/** "Teach the brain" — save a free-text note for a brand (or the portfolio). */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "store_unavailable" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { entity?: string; text?: string };
  const entity = resolveEntity(body.entity);
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });

  // Partners may only teach their own brand — a portfolio-wide (ALL) note is owner-only.
  if (access && !access.isOwner) {
    if (entity === ALL || !access.brands.includes(entity as EntityKey)) {
      return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
    }
  }

  const { error } = await admin.from("brand_notes").insert({
    entity_key: entity === ALL ? null : (entity as EntityKey),
    text,
  });
  return NextResponse.json({ ok: !error, error: error?.message });
}
