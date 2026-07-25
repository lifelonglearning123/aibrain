import { db } from "@/lib/goal-engine/engine/db/server";

/**
 * AI Brain link — the Brain (aibrain.macaws.ai) is the knowledge source and the
 * learning loop; Goal Engine is the execution muscle. Two directions:
 *   1. PULL knowledge to ground drafted flows        (fetchBrainKnowledge)
 *   2. PUSH outcomes so the Brain learns what wins    (reportCampaignOutcomes)
 *
 * Everything here is BEST-EFFORT: if the Brain isn't configured or is down, all
 * calls no-op quietly and Goal Engine runs exactly as before.
 *
 * Config (env):
 *   BRAIN_URL         e.g. https://aibrain.macaws.ai
 *   BRAIN_SECRET      the shared secret (= the Brain's GOAL_ENGINE_ENROLL_SECRET)
 *   BRAIN_BRAND       default Brain brand key for this instance (macaws | artificial-ignorance | leonardo)
 *   BRAIN_BRAND_MAP   optional JSON mapping GHL location id → brand key, e.g. {"abc123":"macaws"}
 */

function brainConfig() {
  const url = (process.env.BRAIN_URL ?? "").replace(/\/$/, "");
  const secret = process.env.BRAIN_SECRET ?? "";
  return { url, secret, configured: Boolean(url && secret) };
}

/** Which Brain brand a GHL location belongs to (map override → single default → none). */
export function resolveBrainBrand(ghlLocationId?: string | null): string | null {
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(process.env.BRAIN_BRAND_MAP ?? "{}");
  } catch {
    /* ignore malformed map */
  }
  if (ghlLocationId && map[ghlLocationId]) return map[ghlLocationId];
  return process.env.BRAIN_BRAND || null;
}

/** A stable, aggregatable angle label for a goal (its prompt, normalised). */
export function angleFromPrompt(prompt: string): string {
  return String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function brainFetch(path: string, init: RequestInit): Promise<Response | null> {
  const { url, secret, configured } = brainConfig();
  if (!configured) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), "x-brain-secret": secret },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface BrainKnowledge {
  promptBlock: string;
  winningAngles: string[];
}

/** Pull the Brain's learned knowledge for the brand this location belongs to. */
export async function fetchBrainKnowledge(
  ghlLocationId?: string | null,
): Promise<BrainKnowledge | null> {
  const brand = resolveBrainBrand(ghlLocationId);
  if (!brand) return null;
  const res = await brainFetch(`/api/knowledge/${encodeURIComponent(brand)}`, { method: "GET" });
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    if (!data?.ok) return null;
    return {
      promptBlock: String(data.promptBlock ?? ""),
      winningAngles: Array.isArray(data.winningAngles) ? data.winningAngles.map(String) : [],
    };
  } catch {
    return null;
  }
}

async function postOutcome(body: {
  brand: string;
  angle: string;
  event: string;
  contactId?: string;
  goalId?: string;
}): Promise<void> {
  await brainFetch(`/api/retargeting/outcome`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Report the outcome of one or more campaigns to the Brain so it learns which
 * angles convert. `event`: converted | no_response | unsubscribed | replied.
 * Best-effort and non-blocking-safe (errors swallowed).
 */
export async function reportCampaignOutcomes(campaignIds: string[], event: string): Promise<void> {
  if (!brainConfig().configured || campaignIds.length === 0) return;
  try {
    const { data: camps } = await db()
      .from("campaigns")
      .select("id, goal_id, location_id, ghl_contact_id")
      .in("id", campaignIds);
    if (!camps || camps.length === 0) return;

    const goalIds = [...new Set(camps.map((c) => c.goal_id as string))];
    const locationIds = [...new Set(camps.map((c) => c.location_id as string))];
    const [{ data: goals }, { data: locs }] = await Promise.all([
      db().from("goals").select("id, prompt").in("id", goalIds),
      db().from("locations").select("id, ghl_location_id").in("id", locationIds),
    ]);
    const goalPrompt = new Map((goals ?? []).map((g) => [g.id as string, g.prompt as string]));
    const locGhl = new Map((locs ?? []).map((l) => [l.id as string, l.ghl_location_id as string]));

    await Promise.allSettled(
      camps.map((c) => {
        const brand = resolveBrainBrand(locGhl.get(c.location_id as string));
        if (!brand) return Promise.resolve();
        return postOutcome({
          brand,
          angle: angleFromPrompt(goalPrompt.get(c.goal_id as string) ?? ""),
          event,
          contactId: c.ghl_contact_id as string,
          goalId: c.goal_id as string,
        });
      }),
    );
  } catch {
    /* learning is best-effort; never disrupt the executor */
  }
}
