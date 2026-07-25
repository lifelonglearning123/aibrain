import { goalEngineDb, goalEngineDbConfigured } from "./db";
import { runDueSteps } from "./engine/executor/tick";
import { executeStep, type StepPreview } from "./engine/executor/executeStep";
import { loadCampaign } from "./engine/executor/state";
import { loadGoalFlow } from "./engine/flow/store";
import { executionEnabled } from "./execution";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ShadowStatus {
  dbReady: boolean;
  executionEnabled: boolean;
  cronSecretSet: boolean;
  encryptionKeySet: boolean;
}

export async function shadowStatus(): Promise<ShadowStatus> {
  return {
    dbReady: await goalEngineDbConfigured(),
    executionEnabled: executionEnabled(),
    cronSecretSet: Boolean(process.env.CRON_SECRET),
    encryptionKeySet: Boolean(process.env.APP_ENCRYPTION_KEY),
  };
}

/** What the Brain would send for steps that are due RIGHT NOW (read-only). */
export async function dueQueuePreview(limit = 25): Promise<StepPreview[]> {
  const res = await runDueSteps({ dryRun: true, limit });
  return res.previews ?? [];
}

export interface SampleSend extends StepPreview {
  goalId: string;
  goalPrompt: string;
}

/**
 * Pick a few RUNNING campaigns and simulate their CURRENT step — regardless of
 * due time — so we always have a concrete "here's what it would send" preview,
 * even though the live Goal Engine drains the actual due queue each minute.
 * Fully read-only: uses the real executor in dry-run, mutates nothing.
 */
export async function sampleShadowSends(limit = 5): Promise<SampleSend[]> {
  const db = await goalEngineDb();
  if (!db) return [];

  const { data: camps } = await db
    .from("campaigns")
    .select("id, goal_id, current_step")
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (camps as any[]) ?? [];
  if (rows.length === 0) return [];

  const goalIds = [...new Set(rows.map((r) => r.goal_id))];
  const { data: goals } = await db.from("goals").select("id, prompt").in("id", goalIds);
  const promptById = new Map<string, string>(((goals as any[]) ?? []).map((g) => [g.id, String(g.prompt ?? "")]));

  const results = await Promise.all(
    rows.map(async (r): Promise<SampleSend | null> => {
      const campaign = await loadCampaign(r.id);
      if (!campaign) return null;
      const { flow } = await loadGoalFlow(campaign.goal_id);
      const step = (flow?.steps ?? [])[campaign.current_step];
      if (!step) {
        return {
          campaignId: campaign.id, stepIndex: campaign.current_step, channel: "?",
          decision: "would_halt", reason: "flow_exhausted",
          goalId: campaign.goal_id, goalPrompt: promptById.get(campaign.goal_id) ?? "",
        };
      }
      let captured: StepPreview | null = null;
      try {
        await executeStep(campaign.id, step, campaign.current_step, {
          dryRun: true,
          onPreview: (p) => { captured = p; },
        });
      } catch (err) {
        captured = { campaignId: campaign.id, stepIndex: campaign.current_step, channel: step.channel, decision: "would_halt", reason: `error:${(err as Error).message}` };
      }
      if (!captured) return null;
      return { ...(captured as StepPreview), goalId: campaign.goal_id, goalPrompt: promptById.get(campaign.goal_id) ?? "" };
    }),
  );
  return results.filter((r): r is SampleSend => r !== null);
}

/** Light context: how active the LIVE Goal Engine has been in the last 24h. */
export async function recentActivity(): Promise<{ last24h: number; sent24h: number }> {
  const db = await goalEngineDb();
  if (!db) return { last24h: 0, sent24h: 0 };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: last24h }, { count: sent24h }] = await Promise.all([
    db.from("step_executions").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("step_executions").select("id", { count: "exact", head: true }).gte("created_at", since).eq("outcome", "sent"),
  ]);
  return { last24h: last24h ?? 0, sent24h: sent24h ?? 0 };
}
