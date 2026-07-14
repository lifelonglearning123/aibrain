import { NextResponse } from "next/server";
import { addTaughtFact, getTaughtFacts } from "@/lib/ai/brain-facts";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { ENTITIES, resolveEntity, ALL, type EntityKey } from "@/lib/entities";

/** Teach the brain a durable fact/correction it should always apply. Owner-only. */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (access && !access.isOwner) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string; entity?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });

  // entity omitted / "all" → portfolio-wide fact; otherwise scope to that brand.
  const resolved = resolveEntity(body.entity);
  const entityKey: EntityKey | null = resolved === ALL ? null : resolved;

  const res = await addTaughtFact({ text, entityKey, createdBy: access?.email ?? undefined });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

/** List active taught facts for the caller's companies. */
export async function GET() {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const brands = access ? access.brands : ENTITIES.map((e) => e.key);
  const isOwner = access ? access.isOwner : true;
  const facts = await getTaughtFacts(brands, isOwner);
  return NextResponse.json({ ok: true, facts });
}
