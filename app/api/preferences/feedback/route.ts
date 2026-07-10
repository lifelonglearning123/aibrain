import { NextResponse } from "next/server";
import { recordFeedback, type FeedbackEvent } from "@/lib/preferences";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";

/** Records approve / edit / reject signals on AI drafts (preference capture). */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { events?: FeedbackEvent[] };
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) {
    return NextResponse.json({ ok: false, error: "no_events" }, { status: 400 });
  }

  // Only accept events for brands the user may touch; normalise the entity key.
  const clean: FeedbackEvent[] = [];
  for (const e of events) {
    const entity = resolveEntity(e.entity ?? undefined);
    if (entity === ALL) continue; // preference events are always brand-specific
    if (access && !access.brands.includes(entity as EntityKey)) continue;
    clean.push({ ...e, entity });
  }
  if (clean.length === 0) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  const written = await recordFeedback(clean);
  return NextResponse.json({ ok: written > 0, written });
}
