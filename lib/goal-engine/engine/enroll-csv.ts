import { db } from "@/lib/goal-engine/engine/db/server";
import { resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { upsertContact, addTag } from "@/lib/goal-engine/engine/ghl/client";
import { loadGoalFlow } from "@/lib/goal-engine/engine/flow/store";
import { enrollFromContact, type GoalRef } from "@/lib/goal-engine/engine/enroll";
import type { EnrollResult } from "@/lib/goal-engine/engine/enroll-batch";
import { parseCsvRaw, guessMapping, applyMapping, type MappedRow } from "@/lib/goal-engine/engine/csv";

/** Auto-parse a CSV to mapped rows (used by the simple upload path). */
export function parseCsv(text: string): MappedRow[] {
  const { headers, rows } = parseCsvRaw(text);
  return applyMapping(rows, guessMapping(headers));
}

/**
 * Upsert each mapped row into GHL (optionally tagging it — a trigger for the
 * agency's own automations), then enrol into the goal's LIVE flow (cap-limited).
 */
export async function runCsvEnroll(goalId: string, rows: MappedRow[], opts?: { addTag?: string }): Promise<EnrollResult> {
  const base: EnrollResult = { enrolled: 0, skipped: 0, scanned: 0, capped: false };

  const { data: goal } = await db().from("goals").select("id, tenant_id, location_id, enroll_daily_cap").eq("id", goalId).single();
  if (!goal) return { ...base, reason: "goal_not_found" };

  const { flow, status } = await loadGoalFlow(goalId);
  if (status !== "live" || !flow || flow.steps.length === 0) return { ...base, reason: "flow_not_live" };

  const cap = Number(goal.enroll_daily_cap) || 200;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: enrolledToday } = await db().from("campaigns").select("id", { count: "exact", head: true }).eq("goal_id", goalId).gte("created_at", todayStart.toISOString());
  let remaining = cap - (enrolledToday ?? 0);
  if (remaining <= 0) return { ...base, capped: true };

  const goalRef: GoalRef = { id: goal.id as string, tenant_id: goal.tenant_id as string, location_id: goal.location_id as string };
  const ctx = await resolveLocationCtx(goalRef.location_id);
  const tag = opts?.addTag?.trim();

  let enrolled = 0;
  let skipped = 0;
  let scanned = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    scanned++;
    if (!row.email && !row.phone) { skipped++; continue; }
    try {
      const contactId = await upsertContact(ctx, {
        email: row.email,
        phone: row.phone,
        firstName: row.firstName,
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || undefined,
        customFields: row.customFields,
      });
      if (tag) await addTag(ctx, contactId, tag).catch(() => {});
      const r = await enrollFromContact(goalRef, flow, {
        id: contactId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        tags: tag ? [tag] : [],
      });
      if (r.isNew) { enrolled++; remaining--; } else skipped++;
    } catch {
      skipped++;
    }
  }
  return { enrolled, skipped, scanned, capped: remaining <= 0 };
}
