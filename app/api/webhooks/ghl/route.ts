import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/goal-engine/engine/db/server";
import { routeInbound } from "@/lib/goal-engine/engine/router/route";
import { markContactOpened } from "@/lib/goal-engine/engine/executor/state";
import { executionEnabled } from "@/lib/goal-engine/execution";

/**
 * GHL webhook ingestion (merged Goal Engine, Phase 4/5). Thin:
 *   1. verify signature (TODO — GHL_WEBHOOK_SECRET / standard-webhooks),
 *   2. upsert into webhook_events (unique external_id = free idempotency),
 *   3. belt-and-braces STOP keyword check BEFORE any model call,
 *   4. hand inbound messages to the router.
 * Enrolment triggers come in via /api/enroll/<goalId>, not here.
 *
 * SHADOW GATE: until GOAL_ENGINE_EXECUTE=true (cutover), the Brain still records
 * every delivery (for idempotency/audit) but takes NO action — no replies, no
 * conversions, no signal writes. Point GHL's webhooks at the Brain only at
 * cutover, together with the flip. The unique external_id means a brief overlap
 * with the old Goal Engine deploy dedupes safely.
 */
const STOP_KEYWORDS = ["stop", "unsubscribe", "cancel", "end", "quit", "stopall", "optout"];

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // TODO: verify signature against process.env.GHL_WEBHOOK_SECRET before trusting body.

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const type = (body.type as string) ?? (body.eventType as string) ?? "unknown";
  const externalId =
    (body.messageId as string) ?? (body.webhookId as string) ?? (body.id as string) ?? `${type}:${raw.length}`;

  const ghlLocationId = (body.locationId as string) ?? null;
  const locId = ghlLocationId ? await internalLocationId(ghlLocationId) : null;

  // Idempotency: a duplicate delivery (same external_id) is a no-op. Recorded in
  // both shadow and live so the Brain never re-acts on a redelivery after cutover.
  const { error: dupErr } = await db()
    .from("webhook_events")
    .insert({ location_id: locId, source: "ghl", external_id: externalId, payload: body });
  if (dupErr) return NextResponse.json({ ok: true, deduped: true });

  // Shadow: recorded, but the Brain takes no outward/state action until the flip.
  if (!executionEnabled()) {
    return NextResponse.json({ ok: true, mode: "shadow", recorded: true, type });
  }

  // Native calendar conversion: an appointment booked marks calendar-target campaigns converted.
  if (type === "AppointmentCreate" || type === "appointment.create" || type === "AppointmentBooked") {
    const contactId =
      (body.contactId as string) ??
      (body.contact_id as string) ??
      ((body.appointment as { contactId?: string })?.contactId) ??
      ((body.contact as { id?: string })?.id);
    if (locId && contactId) {
      const { data: calGoals } = await db().from("goals").select("id").eq("location_id", locId).eq("target_type", "calendar");
      const goalIds = (calGoals ?? []).map((g) => g.id as string);
      if (goalIds.length) {
        const { markConverted } = await import("@/lib/goal-engine/engine/convert");
        await markConverted({ locationId: locId, ghlContactId: String(contactId), goalIds });
      }
    }
    return NextResponse.json({ ok: true, converted: true });
  }

  // Email open tracking — soft engagement signal for `if: opened` flow steps.
  // GHL email-open events vary in shape; match tolerantly and stamp the contact's
  // running campaigns. Verify the exact event type against a real GHL payload.
  const tl = type.toLowerCase();
  if (tl.includes("open") && (tl.includes("email") || tl === "lcemailstats")) {
    const contactId =
      (body.contactId as string) ?? (body.contact_id as string) ?? ((body.contact as { id?: string })?.id);
    if (locId && contactId) {
      await markContactOpened(locId, String(contactId)).catch(() => {});
    }
    return NextResponse.json({ ok: true, opened: true });
  }

  if (type === "InboundMessage" || type === "inbound_message") {
    const text = String(body.message ?? body.body ?? "").trim();
    const contactId =
      (body.contactId as string) ?? (body.contact_id as string) ?? ((body.contact as { id?: string })?.id);
    if (locId && contactId) {
      const normalized = text.toLowerCase().replace(/[^a-z]/g, "");
      const forcedStop = STOP_KEYWORDS.includes(normalized);
      await routeInbound({ locationId: locId, ghlContactId: String(contactId), ghlMessageId: externalId, body: text, forcedStop });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, type });
}

async function internalLocationId(ghlLocationId: string): Promise<string | null> {
  const { data } = await db().from("locations").select("id").eq("ghl_location_id", ghlLocationId).single();
  return data?.id ?? null;
}
