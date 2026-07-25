import { db } from "@/lib/goal-engine/engine/db/server";
import { loadLocation, resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { addNote, addTag, setDnd } from "@/lib/goal-engine/engine/ghl/client";
import { classifyIntent, type Intent } from "@/lib/goal-engine/engine/router/intent";
import { reportCampaignOutcomes } from "@/lib/goal-engine/engine/brain";

/**
 * Inbound routing (blueprint §7). STOP is caught by a keyword check in the
 * webhook (forcedStop) BEFORE the model. Everything else is classified, then:
 *   stop                  → opt out (GHL DND) + halt all sequences
 *   hard_no               → halt (exhausted) + tag; excluded from re-engagement
 *   soft_no               → halt (exhausted) + tag; eligible for re-engagement later
 *   wrong_number          → stop sequences
 *   interested / reschedule / question → pause + human handoff (Phase 1;
 *       auto-booking + RAG answers arrive in Phase 2)
 * Recording the inbound message also makes `no_reply` steps skip going forward.
 */
export async function routeInbound(input: {
  locationId: string; // internal locations.id
  ghlContactId: string;
  ghlMessageId: string;
  body: string;
  forcedStop?: boolean;
}): Promise<void> {
  const loc = await loadLocation(input.locationId);
  if (!loc) return;

  const { data: campaigns } = await db()
    .from("campaigns")
    .select("id")
    .eq("location_id", input.locationId)
    .eq("ghl_contact_id", input.ghlContactId)
    .in("status", ["running", "paused"]);
  const ids = (campaigns ?? []).map((c) => c.id as string);
  const primaryCampaignId = ids[0] ?? null;

  let intent: Intent;
  let confidence = 1;
  if (input.forcedStop) {
    intent = "stop";
  } else {
    try {
      const r = await classifyIntent(input.body);
      intent = r.intent;
      confidence = r.confidence;
    } catch {
      intent = "question"; // safe default → human handoff
      confidence = 0;
    }
  }

  const ctx = await resolveLocationCtx(input.locationId).catch(() => null);
  let routedAction: string;

  if (intent === "stop") {
    routedAction = "opted_out";
    if (ctx) {
      await setDnd(ctx, input.ghlContactId, true).catch(() => {});
      await addNote(ctx, input.ghlContactId, "AI: contact opted out (stop). All sequences halted.").catch(() => {});
    }
    await haltCampaigns(ids, "opted_out");
  } else if (intent === "hard_no") {
    // Firm, final rejection — but NOT a legal opt-out, so no DND. Halt and tag so
    // the re-engagement job never recycles this contact.
    routedAction = "hard_no";
    if (ctx) {
      await addTag(ctx, input.ghlContactId, "ai-hard-no").catch(() => {});
      await addNote(ctx, input.ghlContactId, "AI: firm no. Sequences halted; excluded from re-engagement.").catch(() => {});
    }
    await haltCampaigns(ids, "exhausted");
  } else if (intent === "soft_no") {
    // Polite "not right now" — keep goodwill: halt now, tag as re-engageable so the
    // recycle job can re-work them after a cooldown.
    routedAction = "soft_no";
    if (ctx) {
      await addTag(ctx, input.ghlContactId, "ai-soft-no").catch(() => {});
      await addNote(ctx, input.ghlContactId, "AI: soft no ('not right now'). Sequences halted; eligible for re-engagement later.").catch(() => {});
    }
    await haltCampaigns(ids, "exhausted");
  } else if (intent === "wrong_number") {
    routedAction = "wrong_number";
    if (ctx) {
      await addTag(ctx, input.ghlContactId, "ai-wrong-number").catch(() => {});
      await addNote(ctx, input.ghlContactId, "AI: wrong number reported. Sequence stopped.").catch(() => {});
    }
    await haltCampaigns(ids, "exhausted");
  } else {
    routedAction = "human_handoff";
    if (ctx) {
      await addTag(ctx, input.ghlContactId, "ai-handoff").catch(() => {});
      await addNote(
        ctx,
        input.ghlContactId,
        `AI: reply classified as "${intent}" (confidence ${confidence.toFixed(2)}). Paused for human follow-up.`
      ).catch(() => {});
    }
    await pauseCampaigns(ids);
  }

  await db().from("inbound_messages").insert({
    tenant_id: loc.tenant_id,
    location_id: input.locationId,
    campaign_id: primaryCampaignId,
    ghl_message_id: input.ghlMessageId,
    body: input.body,
    intent,
    intent_confidence: confidence,
    routed_action: routedAction,
  });
}

async function haltCampaigns(ids: string[], status: string): Promise<void> {
  if (!ids.length) return;
  await db().from("campaigns").update({ status }).in("id", ids);
  await cancelSteps(ids);
  // Feed the outcome back to the Brain so it learns (best-effort).
  const event = status === "opted_out" ? "unsubscribed" : status === "exhausted" ? "no_response" : null;
  if (event) await reportCampaignOutcomes(ids, event);
}

async function pauseCampaigns(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db().from("campaigns").update({ status: "paused" }).in("id", ids);
  await cancelSteps(ids);
}

async function cancelSteps(ids: string[]): Promise<void> {
  await db().from("scheduled_steps").update({ done: true }).in("campaign_id", ids).eq("done", false);
}
