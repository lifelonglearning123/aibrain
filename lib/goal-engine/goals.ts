import { goalEngineDb } from "./db";
import { loadGoalFlow } from "./engine/flow/store";
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

export interface FlowStepView {
  id: string;
  channel: string;
  waitHours: number;
  condition: string;
  subject?: string;
  content: string;
  personalize: string;
}

export interface CampaignView {
  id: string;
  contact: string;
  status: string;
  currentStep: number;
  createdAt: string;
}

export interface GoalDetail {
  id: string;
  prompt: string;
  status: string;
  targetType?: string;
  ghlLocationId: string | null;
  steps: FlowStepView[];
  campaigns: CampaignView[];
}

/** Full detail for one goal — its editable flow + its live campaigns. */
export async function getGoalDetail(goalId: string): Promise<GoalDetail | null> {
  const db = await goalEngineDb();
  if (!db) return null;
  const { data: g } = await db
    .from("goals")
    .select("id, prompt, status, target_type, location_id")
    .eq("id", goalId)
    .maybeSingle();
  if (!g) return null;

  let ghlLocationId: string | null = null;
  if ((g as any).location_id) {
    const { data: loc } = await db
      .from("locations")
      .select("ghl_location_id")
      .eq("id", (g as any).location_id)
      .maybeSingle();
    ghlLocationId = (loc as any)?.ghl_location_id ?? null;
  }

  const { flow } = await loadGoalFlow(goalId);
  const steps: FlowStepView[] = (flow?.steps ?? []).map((s) => ({
    id: s.id,
    channel: s.channel,
    waitHours: s.wait_hours,
    condition: s.if,
    subject: s.subject,
    content: s.content,
    personalize: s.personalize,
  }));

  const { data: camps } = await db
    .from("campaigns")
    .select("id, status, current_step, created_at, contact_name, contact_phone, contact_email, ghl_contact_id")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false })
    .limit(100);
  const campaigns: CampaignView[] = ((camps as any[]) ?? []).map((c) => ({
    id: String(c.id),
    contact: String(c.contact_name || c.contact_phone || c.contact_email || c.ghl_contact_id || "—"),
    status: String(c.status ?? ""),
    currentStep: Number(c.current_step) || 0,
    createdAt: String(c.created_at ?? ""),
  }));

  return {
    id: String(g.id),
    prompt: String((g as any).prompt ?? ""),
    status: String((g as any).status ?? ""),
    targetType: (g as any).target_type ? String((g as any).target_type) : undefined,
    ghlLocationId,
    steps,
    campaigns,
  };
}

/** Which allowed brand a Goal Engine GHL location belongs to (for access checks). */
export async function entityForGhlLocation(
  ghlLocationId: string | null,
  brands: EntityKey[],
): Promise<EntityKey | null> {
  if (!ghlLocationId) return null;
  for (const b of brands) {
    const cfg = await ghlConfigForEntity(b);
    if (cfg.locationId && cfg.locationId === ghlLocationId) return b;
  }
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
