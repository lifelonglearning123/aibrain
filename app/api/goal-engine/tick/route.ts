import { NextRequest, NextResponse } from "next/server";
import { runDueSteps } from "@/lib/goal-engine/engine/executor/tick";
import { goalEngineDbConfigured } from "@/lib/goal-engine/db";
import { checkCronSecret, executionEnabled } from "@/lib/goal-engine/execution";

/**
 * Brain sender tick (merged Goal Engine, Phase 4). Cron-guarded.
 *
 * - SHADOW (default): simulates every due step and returns what it WOULD send —
 *   claims nothing, sends nothing, writes nothing. Safe to run while the live
 *   Goal Engine still owns the queue.
 * - LIVE: only when GOAL_ENGINE_EXECUTE=true. Runs the real tick (claims steps,
 *   sends, advances). This is the cutover flip.
 *
 * `?mode=shadow` forces shadow even when execution is enabled (a safety
 * override); there is deliberately no `?mode=live` — going live requires the env
 * flag, so no URL can accidentally cause a send.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!(await goalEngineDbConfigured())) {
    return NextResponse.json({ ok: false, error: "goal_engine_db_not_configured" }, { status: 503 });
  }

  const forceShadow = req.nextUrl.searchParams.get("mode") === "shadow";
  const dryRun = forceShadow || !executionEnabled();

  const result = await runDueSteps({ dryRun });
  if (dryRun) {
    const wouldSend = (result.previews ?? []).filter((p) => p.decision === "would_send").length;
    console.log(`[goal-engine tick] shadow: ${result.processed} due, ${wouldSend} would send`);
    return NextResponse.json({ ok: true, mode: "shadow", ...result });
  }
  console.log(`[goal-engine tick] LIVE: processed ${result.processed}`);
  return NextResponse.json({ ok: true, mode: "live", ...result });
}
