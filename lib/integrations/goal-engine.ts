/**
 * Goal Engine connector — the entire "plug" between the AI Brain and your
 * live Goal Engine retargeting app (C:\python\Lead generator, goal-engine.vercel.app).
 *
 * Contract (from Goal Engine): POST /api/enroll/<goalId> with an `x-enroll-secret`
 * header and { contactId } in the body. If Goal Engine's contract ever changes,
 * this is the ONE file to update.
 */

import { cred } from "@/lib/credentials";

export async function goalEngineConfig() {
  const url = await cred("GOAL_ENGINE_URL");
  const secret = await cred("GOAL_ENGINE_ENROLL_SECRET");
  return { url, secret, configured: Boolean(url && secret) };
}

export interface GoalSummary {
  id: string;
  /** The natural-language goal description — used as the dropdown label. */
  prompt: string;
  status: string;
  targetType?: string;
}

/** List a brand's Goal Engine goals (by its GHL location) for the picker. */
export async function listGoals(
  ghlLocationId: string,
): Promise<{ ok: boolean; goals: GoalSummary[]; error?: string }> {
  const { url, secret, configured } = await goalEngineConfig();
  if (!configured || !url || !secret) return { ok: false, goals: [], error: "not_configured" };
  try {
    const endpoint = `${url.replace(/\/$/, "")}/api/goals?locationId=${encodeURIComponent(
      ghlLocationId,
    )}`;
    const res = await fetch(endpoint, {
      headers: { "x-enroll-secret": secret },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, goals: [], error: `http_${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { goals?: unknown };
    const goals = Array.isArray(data.goals)
      ? (data.goals as Record<string, unknown>[])
          .map((g) => ({
            id: String(g.id ?? ""),
            prompt: String(g.prompt ?? ""),
            status: String(g.status ?? ""),
            targetType: g.targetType ? String(g.targetType) : undefined,
          }))
          .filter((g) => g.id)
      : [];
    return { ok: true, goals };
  } catch (e) {
    return { ok: false, goals: [], error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

export interface EnrollResult {
  ok: boolean;
  status: number;
  queued?: boolean;
  error?: string;
}

/** Enrol a single GHL contact into a Goal Engine goal (starts its retargeting flow). */
export async function enrollContact(params: {
  goalId: string;
  contactId: string;
}): Promise<EnrollResult> {
  const { url, secret, configured } = await goalEngineConfig();
  if (!configured || !url || !secret) {
    return { ok: false, status: 0, error: "not_configured" };
  }

  const endpoint = `${url.replace(/\/$/, "")}/api/enroll/${encodeURIComponent(
    params.goalId,
  )}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-enroll-secret": secret,
      },
      body: JSON.stringify({ contactId: params.contactId }),
      cache: "no-store",
    });

    let data: { ok?: boolean; queued?: boolean; error?: string } = {};
    try {
      data = await res.json();
    } catch {
      /* Goal Engine returns JSON; ignore parse errors */
    }

    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: data.error ?? `http_${res.status}`,
      };
    }
    return { ok: true, status: res.status, queued: data.queued };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "fetch_failed",
    };
  }
}
