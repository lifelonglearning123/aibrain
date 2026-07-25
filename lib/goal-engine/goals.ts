import { goalEngineDb } from "./db";
import type { EntityKey } from "@/lib/entities";
import { ghlConfigForEntity } from "@/lib/integrations/ghl";

/**
 * Read a brand's Goal Engine goals + campaign status natively (from Goal
 * Engine's own DB) — the first surface of the merged Brain. Maps the brand's
 * GHL location → Goal Engine's internal location(s) → goals, with a live
 * running/total campaign count per goal.
 */

export interface GoalRow {
  id: string;
  prompt: string;
  status: string;
  targetType?: string;
  running: number;
  totalCampaigns: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listBrandGoals(entity: EntityKey): Promise<GoalRow[]> {
  const db = await goalEngineDb();
  if (!db) return [];
  const cfg = await ghlConfigForEntity(entity);
  if (!cfg.locationId) return [];

  const { data: locs } = await db
    .from("locations")
    .select("id")
    .eq("ghl_location_id", cfg.locationId);
  const internalIds = ((locs as any[]) ?? []).map((l) => l.id);
  if (internalIds.length === 0) return [];

  const { data: goals } = await db
    .from("goals")
    .select("id, prompt, status, target_type, created_at")
    .in("location_id", internalIds)
    .order("created_at", { ascending: false })
    .limit(50);
  const goalRows = (goals as any[]) ?? [];
  const goalIds = goalRows.map((g) => g.id);

  const counts = new Map<string, { running: number; total: number }>();
  if (goalIds.length) {
    const { data: camps } = await db
      .from("campaigns")
      .select("goal_id, status")
      .in("goal_id", goalIds);
    for (const c of (camps as any[]) ?? []) {
      const e = counts.get(c.goal_id) ?? { running: 0, total: 0 };
      e.total += 1;
      if (String(c.status) === "running") e.running += 1;
      counts.set(c.goal_id, e);
    }
  }

  return goalRows.map((g) => ({
    id: String(g.id),
    prompt: String(g.prompt ?? ""),
    status: String(g.status ?? ""),
    targetType: g.target_type ? String(g.target_type) : undefined,
    running: counts.get(g.id)?.running ?? 0,
    totalCampaigns: counts.get(g.id)?.total ?? 0,
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
