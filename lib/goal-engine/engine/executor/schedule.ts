import { db } from "@/lib/goal-engine/engine/db/server";
import { loadLocation } from "@/lib/goal-engine/engine/ghl/context";
import { clampToQuietHours } from "@/lib/goal-engine/engine/cadence/quiet-hours";
import type { FlowStep } from "@/lib/goal-engine/engine/flow/schema";

/**
 * Insert the scheduled_steps row the tick will pick up. `wait_hours` on a step
 * means "wait this long after the previous step"; we schedule step N at
 * (now + step[N].wait_hours), clamped into the location's quiet-hours window.
 */
export async function scheduleStep(
  campaignId: string,
  stepIndex: number,
  steps: FlowStep[],
  locationId: string,
  baseline: Date = new Date()
): Promise<boolean> {
  const step = steps[stepIndex];
  if (!step) return false; // flow exhausted

  const loc = await loadLocation(locationId);
  const win = {
    startHour: loc?.quiet_start ?? 9,
    endHour: loc?.quiet_end ?? 20,
    timezone: loc?.timezone ?? "America/Chicago",
  };

  const desired = new Date(baseline.getTime() + (step.wait_hours ?? 0) * 3_600_000);
  const due = clampToQuietHours(desired, win); // sms/email only channels in a flow

  await db().from("scheduled_steps").insert({
    campaign_id: campaignId,
    step_index: stepIndex,
    due_at: due.toISOString(),
  });
  return true;
}
