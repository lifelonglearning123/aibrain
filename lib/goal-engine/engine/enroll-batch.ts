import { db } from "@/lib/goal-engine/engine/db/server";
import { resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { searchContactsByTag } from "@/lib/goal-engine/engine/ghl/client";
import { loadGoalFlow } from "@/lib/goal-engine/engine/flow/store";
import { enrollFromContact, type GoalRef } from "@/lib/goal-engine/engine/enroll";

export interface EnrollResult {
  enrolled: number;
  skipped: number;
  scanned: number;
  capped: boolean;
  reason?: string;
}

/**
 * Bulk enrol contacts matching the goal's enroll_tags into its LIVE flow.
 * Guardrails: daily cap, skip DND/opted-out, skip contacts with no phone+email,
 * skip already-enrolled (idempotent). Used by both "Enrol now" and auto-enrol.
 */
export async function runEnrollPass(goalId: string): Promise<EnrollResult> {
  const base: EnrollResult = { enrolled: 0, skipped: 0, scanned: 0, capped: false };

  const { data: goal } = await db()
    .from("goals")
    .select("id, tenant_id, location_id, enroll_tags, enroll_daily_cap")
    .eq("id", goalId)
    .single();
  if (!goal) return { ...base, reason: "goal_not_found" };

  const tags = (goal.enroll_tags as string[]) ?? [];
  if (!tags.length) return { ...base, reason: "no_tags" };

  const { flow, status } = await loadGoalFlow(goalId);
  if (status !== "live" || !flow || flow.steps.length === 0) return { ...base, reason: "flow_not_live" };

  const cap = Number(goal.enroll_daily_cap) || 200;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: enrolledToday } = await db()
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId)
    .gte("created_at", todayStart.toISOString());
  let remaining = cap - (enrolledToday ?? 0);
  if (remaining <= 0) return { ...base, capped: true };

  const goalRef: GoalRef = { id: goal.id as string, tenant_id: goal.tenant_id as string, location_id: goal.location_id as string };
  const ctx = await resolveLocationCtx(goalRef.location_id);

  let enrolled = 0;
  let skipped = 0;
  let scanned = 0;
  const seen = new Set<string>();

  for (const tag of tags) {
    if (remaining <= 0) break;
    const contacts = await searchContactsByTag(ctx, tag, { limit: Math.min(500, remaining * 3) });
    for (const contact of contacts) {
      if (remaining <= 0) break;
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      scanned++;
      if (contact.dnd) { skipped++; continue; }
      if (!contact.phone && !contact.email) { skipped++; continue; }
      const r = await enrollFromContact(goalRef, flow, contact);
      if (r.isNew) { enrolled++; remaining--; } else { skipped++; }
    }
  }

  return { enrolled, skipped, scanned, capped: remaining <= 0 };
}
