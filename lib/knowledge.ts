import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads the brain's learned knowledge for a brand (shared portfolio insights +
 * that brand's own), for injecting into Social drafts and Goal Engine sequences.
 * Insights linked to bookings (converts=true) are prioritised.
 */

export interface BrandKnowledge {
  painPoints: string[];
  objections: string[];
  winningPhrases: string[];
  faqs: string[];
  topics: string[];
}

const EMPTY: BrandKnowledge = {
  painPoints: [],
  objections: [],
  winningPhrases: [],
  faqs: [],
  topics: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getBrandKnowledge(
  entity: string,
  opts: { includeShared?: boolean } = {},
): Promise<BrandKnowledge> {
  const { includeShared = true } = opts;
  const admin = createAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin
    .from("brand_knowledge")
    .select("kind,text,scope,entity_key,converts,evidence_count")
    .eq("status", "active");
  if (!data) return EMPTY;

  const rows = (data as any[]).filter(
    (r) => (includeShared && r.scope === "shared") || r.entity_key === entity,
  );
  const pick = (kind: string) => {
    const seen = new Set<string>();
    return rows
      .filter((r) => r.kind === kind)
      // Converters first, then the strongest evidence (funnel-proven winners have
      // the most) — so angles proven by real outcomes lead the list.
      .sort(
        (a, b) =>
          (b.converts ? 1 : 0) - (a.converts ? 1 : 0) ||
          (Number(b.evidence_count) || 0) - (Number(a.evidence_count) || 0),
      )
      .map((r) => String(r.text))
      .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
      .slice(0, 8);
  };

  return {
    painPoints: pick("pain_point"),
    objections: pick("objection"),
    winningPhrases: pick("winning_phrase"),
    faqs: pick("faq"),
    topics: pick("topic"),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Format knowledge as a prompt block. Returns "" when there's nothing learned yet. */
export function knowledgePrompt(k: BrandKnowledge): string {
  const parts: string[] = [];
  if (k.painPoints.length) parts.push(`Customer pain points: ${k.painPoints.join("; ")}`);
  if (k.objections.length) parts.push(`Common objections: ${k.objections.join("; ")}`);
  if (k.winningPhrases.length) parts.push(`Winning angles/phrases: ${k.winningPhrases.join("; ")}`);
  if (k.faqs.length) parts.push(`Frequently asked: ${k.faqs.join("; ")}`);
  return parts.join("\n");
}

export function hasKnowledge(k: BrandKnowledge): boolean {
  return (
    k.painPoints.length + k.objections.length + k.winningPhrases.length + k.faqs.length > 0
  );
}
