/**
 * Apify connector — market/lead research via Apify actors.
 * Contract: POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items
 * with Bearer auth and the actor's input as the JSON body → returns dataset items
 * directly (waits up to 300s). Actor is configurable via APIFY_ACTOR_ID.
 */

import { cred } from "@/lib/credentials";

const BASE = "https://api.apify.com/v2";

export async function apifyConfig() {
  const token = await cred("APIFY_TOKEN");
  // Default: Google Places/Maps scraper (local-business lead research).
  const actorId = (await cred("APIFY_ACTOR_ID")) ?? "compass~crawler-google-places";
  return { token, actorId, configured: Boolean(token && actorId) };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ResearchResult {
  ok: boolean;
  items?: any[];
  error?: string;
}

export async function runResearch(query: string): Promise<ResearchResult> {
  const { token, actorId, configured } = await apifyConfig();
  if (!configured || !token) return { ok: false, error: "not_configured" };

  // Generic input — actors ignore unknown keys; tune APIFY_ACTOR_ID to your use case.
  const input = {
    searchStringsArray: [query],
    search: query,
    query,
    maxItems: 25,
  };

  try {
    const res = await fetch(
      `${BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?clean=true&limit=25`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const items = await res.json().catch(() => []);
    return { ok: true, items: Array.isArray(items) ? items.slice(0, 25) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "research_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
