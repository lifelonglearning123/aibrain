import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Funnel self-learning — closes the retargeting loop. Goal Engine reports what
 * each angle actually did (converted / ignored). We keep raw signals, then distil
 * angles that repeatedly convert into `winning_phrase` insights, which flow back
 * into the next drafted sequence AND the Knowledge Provider API. So the funnel
 * improves itself from real outcomes. All stored in brand_knowledge — no new table.
 *
 *  - kind='funnel_signal' (source='funnel')       : one raw outcome per report
 *  - kind='winning_phrase' (source='funnel_distilled') : a proven angle (converts=true)
 */

const STRONG_WIN = new Set(["converted", "booked", "won", "purchased"]);
const POSITIVE = new Set([...STRONG_WIN, "replied", "clicked", "positive"]);
const MIN_SAMPLES = 3; // need a few data points before trusting an angle
const WIN_RATE = 0.5; // ≥50% of reports on this angle are strong wins → it's a winner

export interface OutcomeInput {
  brand: string;
  angle: string; // a stable label for the message/angle used
  event: string; // converted | booked | replied | clicked | no_response | unsubscribed | ...
  channel?: string;
  contactId?: string;
  goalId?: string;
}

export interface OutcomeResult {
  ok: boolean;
  recorded?: boolean;
  learnedWinner?: boolean;
  removedWinner?: boolean;
  samples?: number;
  winRate?: number;
  error?: string;
}

function isBrand(key: string): key is EntityKey {
  return ENTITIES.some((e) => e.key === key);
}

export async function recordOutcome(input: OutcomeInput): Promise<OutcomeResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  if (!isBrand(input.brand)) return { ok: false, error: "unknown_brand" };
  const angle = String(input.angle ?? "").trim().slice(0, 200);
  const event = String(input.event ?? "").trim().toLowerCase();
  if (!angle || !event) return { ok: false, error: "angle_and_event_required" };

  const brand = input.brand;
  const strongWin = STRONG_WIN.has(event);

  // 1) Record the raw signal.
  const { error: insErr } = await admin.from("brand_knowledge").insert({
    scope: "brand",
    entity_key: brand,
    kind: "funnel_signal",
    text: angle,
    converts: strongWin,
    source: "funnel",
    status: "active",
  });
  if (insErr) return { ok: false, error: insErr.message };

  // 2) Recompute this angle's track record and (un)promote it.
  const { data: rows } = await admin
    .from("brand_knowledge")
    .select("converts")
    .eq("entity_key", brand)
    .eq("source", "funnel")
    .eq("kind", "funnel_signal")
    .eq("text", angle);

  const samples = rows?.length ?? 0;
  const wins = (rows ?? []).filter((r) => r.converts).length;
  const winRate = samples > 0 ? wins / samples : 0;

  // Clear any prior distilled verdict for this exact angle, then re-add if earned.
  await admin
    .from("brand_knowledge")
    .delete()
    .eq("entity_key", brand)
    .eq("source", "funnel_distilled")
    .eq("text", angle);

  let learnedWinner = false;
  if (samples >= MIN_SAMPLES && winRate >= WIN_RATE) {
    await admin.from("brand_knowledge").insert({
      scope: "brand",
      entity_key: brand,
      kind: "winning_phrase",
      text: angle,
      converts: true,
      evidence_count: samples,
      source: "funnel_distilled",
      status: "active",
    });
    learnedWinner = true;
  }

  return {
    ok: true,
    recorded: true,
    learnedWinner,
    removedWinner: !learnedWinner,
    samples,
    winRate: Math.round(winRate * 100) / 100,
  };
}

/** Angles the funnel has proven to convert, for the Retargeting UI. */
export async function getFunnelWinners(
  brands: EntityKey[],
): Promise<{ brand: string; angle: string; evidence: number }[]> {
  const admin = createAdminClient();
  if (!admin || brands.length === 0) return [];
  const { data } = await admin
    .from("brand_knowledge")
    .select("entity_key,text,evidence_count")
    .eq("source", "funnel_distilled")
    .eq("status", "active")
    .in("entity_key", brands)
    .order("evidence_count", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({
    brand: String(r.entity_key),
    angle: String(r.text),
    evidence: Number(r.evidence_count) || 0,
  }));
}
