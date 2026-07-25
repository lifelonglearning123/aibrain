import type { NextRequest } from "next/server";

/**
 * Phase 4 merge — the single gate that decides whether the Brain actually
 * RUNS Goal Engine's execution (sends messages, enrols contacts, recycles
 * leads) or only shadows it.
 *
 * Until cutover this stays OFF: the Brain's sender tick runs in shadow (dry-run,
 * sends nothing), and enrol/re-engage are no-ops — the live Goal Engine still
 * owns execution. Cutover is a single flip: set GOAL_ENGINE_EXECUTE=true in the
 * Brain and turn Goal Engine's own crons off, together.
 */
export function executionEnabled(): boolean {
  return process.env.GOAL_ENGINE_EXECUTE === "true";
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Reject anything else
 * so these endpoints can't be triggered externally. If no secret is configured
 * we fail closed (deny) rather than run unauthenticated execution.
 */
export function checkCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
