import { db } from "@/lib/goal-engine/engine/db/server";
import { resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { getContact, type GhlContact } from "@/lib/goal-engine/engine/ghl/client";
import { loadGoalFlow } from "@/lib/goal-engine/engine/flow/store";
import { scheduleStep } from "@/lib/goal-engine/engine/executor/schedule";
import type { Flow } from "@/lib/goal-engine/engine/flow/schema";

/**
 * Enrol contacts into a goal's LIVE flow. Snapshots the contact
 * (name/email/phone/tags) for the dashboard; messages are personalized per lead
 * at send time. Idempotent per (goal, contact).
 */

export interface GoalRef {
  id: string;
  tenant_id: string;
  location_id: string;
}

export async function loadGoal(goalId: string): Promise<GoalRef | null> {
  const { data } = await db().from("goals").select("id, tenant_id, location_id").eq("id", goalId).single();
  return (data as GoalRef) ?? null;
}

/** Enrol from an already-fetched GHL contact record. Returns whether it was new. */
export async function enrollFromContact(goal: GoalRef, flow: Flow, contact: GhlContact): Promise<{ id: string | null; isNew: boolean }> {
  const { data: existing } = await db()
    .from("campaigns")
    .select("id")
    .eq("goal_id", goal.id)
    .eq("ghl_contact_id", contact.id)
    .maybeSingle();
  if (existing) return { id: existing.id as string, isNew: false };

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.contactName || null;
  const { data: inserted, error } = await db()
    .from("campaigns")
    .insert({
      tenant_id: goal.tenant_id,
      goal_id: goal.id,
      location_id: goal.location_id,
      ghl_contact_id: contact.id,
      current_step: 0,
      status: "running",
      contact_name: name,
      contact_email: contact.email ?? null,
      contact_phone: contact.phone ?? null,
      contact_tags: contact.tags ?? [],
    })
    .select("id")
    .single();

  if (error) {
    const { data: race } = await db().from("campaigns").select("id").eq("goal_id", goal.id).eq("ghl_contact_id", contact.id).maybeSingle();
    return { id: (race?.id as string) ?? null, isNew: false };
  }

  const id = inserted!.id as string;
  await scheduleStep(id, 0, flow.steps, goal.location_id);
  return { id, isNew: true };
}

/** Single-contact enrol (the GHL-workflow webhook path). */
export async function enrollContact(input: { goalId: string; ghlContactId: string }): Promise<string | null> {
  const goal = await loadGoal(input.goalId);
  if (!goal) throw new Error(`Unknown goal ${input.goalId}`);

  const { flow, status } = await loadGoalFlow(goal.id);
  if (status !== "live" || !flow || flow.steps.length === 0) {
    throw new Error("Goal flow is not live — review and set it live before enrolling contacts.");
  }

  const ctx = await resolveLocationCtx(goal.location_id);
  const contact = await getContact(ctx, input.ghlContactId);
  if (!contact) throw new Error(`Contact ${input.ghlContactId} not found`);

  const r = await enrollFromContact(goal, flow, contact);
  return r.id;
}
