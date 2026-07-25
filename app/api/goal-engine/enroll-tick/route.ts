import { NextRequest, NextResponse } from "next/server";
import { goalEngineDb, goalEngineDbConfigured } from "@/lib/goal-engine/db";
import { runEnrollPass } from "@/lib/goal-engine/engine/enroll-batch";
import { checkCronSecret, executionEnabled } from "@/lib/goal-engine/execution";

/**
 * Brain auto-enrol cron (merged Goal Engine, Phase 4). Cron-guarded.
 *
 * Enrolment CREATES campaigns (it pulls new tagged contacts into a live flow),
 * so there is no meaningful shadow of it — until cutover the live Goal Engine
 * still owns enrolment and this is a no-op. It only runs when
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

  const db = await goalEngineDb();
  const { data: goals } = await db!
    .from("goals")
    .select("id")
    .eq("auto_enroll", true)
    .eq("status", "active")
    .limit(200);

  const results: Record<string, unknown> = {};
  for (const g of goals ?? []) {
    try {
      results[g.id as string] = await runEnrollPass(g.id as string);
    } catch (err) {
      results[g.id as string] = { error: String(err) };
    }
  }
  return NextResponse.json({ ok: true, mode: "live", goals: goals?.length ?? 0, results });
}
