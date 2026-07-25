import { NextRequest, NextResponse } from "next/server";
import { runReengage } from "@/lib/goal-engine/engine/executor/reengage";
import { goalEngineDbConfigured } from "@/lib/goal-engine/db";
import { checkCronSecret, executionEnabled } from "@/lib/goal-engine/execution";

/**
 * Brain daily re-engagement cron (merged Goal Engine, Phase 4). Cron-guarded.
 *
 * Re-engagement recycles cold / soft-no contacts back into a flow (it mutates
 * campaigns), so like enrolment it has no meaningful shadow — until cutover the
 * live Goal Engine still owns it and this is a no-op. It only runs when
 * GOAL_ENGINE_EXECUTE=true (the cutover flip).
 */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!executionEnabled()) {
    return NextResponse.json({ ok: true, mode: "shadow", skipped: "execution_disabled" });
  }
  if (!(await goalEngineDbConfigured())) {
    return NextResponse.json({ ok: false, error: "goal_engine_db_not_configured" }, { status: 503 });
  }

  const result = await runReengage();
  return NextResponse.json({ ok: true, mode: "live", ...result });
}
