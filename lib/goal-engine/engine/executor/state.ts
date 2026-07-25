import { db } from "@/lib/goal-engine/engine/db/server";
import { reportCampaignOutcomes } from "@/lib/goal-engine/engine/brain";

/**
 * Campaign execution state lives in Supabase (`campaigns` + `step_executions`);
 * outcomes are also mirrored to GHL for agency visibility (see executeStep).
 * Campaigns run their GOAL's flow (lib/flow) — no per-contact plan.
 */

export type CampaignStatus =
  | "planning" | "running" | "paused" | "converted" | "opted_out" | "exhausted" | "error";

export interface CampaignRow {
  id: string;
  tenant_id: string;
  goal_id: string;
  location_id: string;
  ghl_contact_id: string;
  current_step: number;
  status: CampaignStatus;
}

export async function loadCampaign(campaignId: string): Promise<CampaignRow | null> {
  const { data, error } = await db().from("campaigns").select("*").eq("id", campaignId).single();
  if (error) return null;
  return data as CampaignRow;
}

/** The pre-step guard (blueprint §8): only "running" campaigns advance. */
export async function campaignStatus(campaignId: string): Promise<CampaignStatus | null> {
  const { data } = await db().from("campaigns").select("status").eq("id", campaignId).single();
  return (data?.status as CampaignStatus) ?? null;
}

export async function setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
  await db().from("campaigns").update({ status }).eq("id", campaignId);
  // A campaign that runs its whole sequence without converting is a "loss" —
  // tell the Brain so its angle win-rate has a denominator (best-effort).
  if (status === "exhausted") await reportCampaignOutcomes([campaignId], "no_response");
}

export async function setCurrentStep(campaignId: string, stepIndex: number): Promise<void> {
  await db().from("campaigns").update({ current_step: stepIndex }).eq("id", campaignId);
}

/** True if the contact has replied in the CURRENT cycle — gates `if: no_reply` steps.
 *  Scoped to cycle_started_at so a recycled campaign ignores the previous cycle's replies. */
export async function hasReplied(campaignId: string): Promise<boolean> {
  const { data: c } = await db()
    .from("campaigns").select("cycle_started_at").eq("id", campaignId).single();
  const since = c?.cycle_started_at as string | undefined;
  const base = db()
    .from("inbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  const { count } = since ? await base.gte("created_at", since) : await base;
  return (count ?? 0) > 0;
}

/** True if the contact opened a tracked email since enrolment — gates `if: opened`. */
export async function hasOpened(campaignId: string): Promise<boolean> {
  const { data } = await db()
    .from("campaigns").select("last_opened_at").eq("id", campaignId).single();
  return data?.last_opened_at != null;
}

/**
 * Best-effort: stamp the latest email open on the contact's running campaign(s)
 * at this location. A soft engagement signal — callers ignore failures.
 */
export async function markContactOpened(locationId: string, ghlContactId: string): Promise<void> {
  await db()
    .from("campaigns")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("location_id", locationId)
    .eq("ghl_contact_id", ghlContactId)
    .eq("status", "running");
}

export async function recordStepExecution(row: {
  tenantId: string;
  campaignId: string;
  stepIndex: number;
  channel: string;
  payload?: unknown;
  ghlMessageId?: string;
  outcome: string;
  costCents?: number;
}): Promise<void> {
  await db().from("step_executions").insert({
    tenant_id: row.tenantId,
    campaign_id: row.campaignId,
    step_index: row.stepIndex,
    channel: row.channel,
    payload: row.payload ?? null,
    ghl_message_id: row.ghlMessageId ?? null,
    outcome: row.outcome,
    cost_cents: row.costCents ?? null,
  });
}

export async function meter(row: {
  tenantId: string;
  metric: string;
  quantity: number;
  campaignId?: string;
}): Promise<void> {
  await db().from("usage_ledger").insert({
    tenant_id: row.tenantId,
    metric: row.metric,
    quantity: row.quantity,
    campaign_id: row.campaignId ?? null,
  });
}
