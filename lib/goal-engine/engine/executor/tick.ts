import { db } from "@/lib/goal-engine/engine/db/server";
import { executeStep } from "@/lib/goal-engine/engine/executor/executeStep";
import { scheduleStep } from "@/lib/goal-engine/engine/executor/schedule";
import { loadCampaign, setCampaignStatus } from "@/lib/goal-engine/engine/executor/state";
import { loadGoalFlow } from "@/lib/goal-engine/engine/flow/store";

/**
 * The Vercel Cron worker (fork #4). Runs every minute:
 *   1. claim due scheduled_steps,
 *   2. run each via the engine-agnostic executeStep,
 *   3. schedule the next step (or halt).
 * The claim (update ... where claimed_at is null) makes concurrent ticks safe.
 */
export async function runDueSteps(limit = 50): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();

  const { data: due } = await db()
    .from("scheduled_steps")
    .select("id, campaign_id, step_index")
    .lte("due_at", nowIso)
    .is("claimed_at", null)
    .eq("done", false)
    .order("due_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const row of due ?? []) {
    // Claim atomically — skip if another tick got here first.
    const { data: claimed } = await db()
      .from("scheduled_steps")
      .update({ claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("claimed_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    processed++;

    try {
      const campaign = await loadCampaign(row.campaign_id);
      if (!campaign) {
        await markDone(row.id);
        continue;
      }
      const { flow } = await loadGoalFlow(campaign.goal_id);
      const steps = flow?.steps ?? [];
      const step = steps[row.step_index];
      if (!step) {
        await markDone(row.id);
        await setCampaignStatus(campaign.id, "exhausted");
        continue;
      }

      const directive = await executeStep(campaign.id, step, row.step_index);
      await markDone(row.id);

      if (directive.action === "advance") {
        if (!(await scheduleStep(campaign.id, directive.nextStep, steps, campaign.location_id))) {
          await setCampaignStatus(campaign.id, "exhausted");
        }
      } else if (directive.action === "skip") {
        if (directive.reason.startsWith("deferred_to_")) {
          // Quiet-hours re-check bounced us — retry the SAME step at the clamped time.
          const iso = directive.reason.replace("deferred_to_", "");
          await db().from("scheduled_steps").insert({
            campaign_id: campaign.id,
            step_index: row.step_index,
            due_at: iso,
          });
        } else if (!(await scheduleStep(campaign.id, directive.nextStep, steps, campaign.location_id))) {
          await setCampaignStatus(campaign.id, "exhausted");
        }
      } else if (directive.action === "halt" && directive.reason === "send_error") {
        await setCampaignStatus(campaign.id, "error");
      }
      // other halts (opted_out / booked / status_*) already reflected on the campaign
    } catch {
      // Don't let one poison row wedge the tick; the error is logged in step_executions.
      await markDone(row.id);
    }
  }

  return { processed };
}

async function markDone(id: string): Promise<void> {
  await db().from("scheduled_steps").update({ done: true }).eq("id", id);
}
