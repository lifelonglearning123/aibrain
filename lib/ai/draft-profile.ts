import { chatJSON, openaiConfig } from "./openai";
import { getBrandKnowledge } from "@/lib/knowledge";
import { getTaughtFacts } from "./brain-facts";
import { getBrandRevenue, listBrandSubscriptions, getBrandRevenueMix } from "@/lib/integrations/stripe";
import { getBrandPipeline, fetchOutboundSamples } from "@/lib/integrations/ghl";
import {
  getBrandProfile,
  brandName,
  PROFILE_FIELDS,
  type BrandProfile,
} from "@/lib/brand-profile";
import { type EntityKey } from "@/lib/entities";

/**
 * AI-drafts a business profile from everything the brain already knows — learned
 * insights, taught facts, live billing (plans/prices/MRR), revenue mix and pipeline.
 * The human then improves it (the "default shift": AI does the 80%, you refine).
 * Voice samples are deliberately left blank — those must be the owner's real writing.
 */
export async function draftBrandProfile(
  entity: EntityKey,
  opts?: { answers?: { q: string; a: string }[] },
): Promise<{ ok: boolean; profile?: BrandProfile; error?: string }> {
  if (!(await openaiConfig()).configured) return { ok: false, error: "openai_not_configured" };
  const name = brandName(entity);
  const answers = (opts?.answers ?? []).filter((x) => x?.a && x.a.trim());

  const [k, facts, subsRes, mix, rev, pipe, existing, voiceSamples] = await Promise.all([
    getBrandKnowledge(entity, { includeShared: false }),
    getTaughtFacts([entity], true),
    listBrandSubscriptions(entity),
    getBrandRevenueMix(entity, 90),
    getBrandRevenue(entity),
    getBrandPipeline(entity),
    getBrandProfile(entity),
    fetchOutboundSamples(entity, 2),
  ]);

  // Distinct subscription plans → strong signal for offer + pricing.
  const planMap = new Map<string, { amount: number; interval: string; count: number; cur: string }>();
  for (const s of subsRes.subs) {
    const e = planMap.get(s.plan) ?? { amount: s.listPrice, interval: s.interval, count: 0, cur: s.currency };
    e.count += 1;
    planMap.set(s.plan, e);
  }
  const plans = [...planMap.entries()]
    .map(([plan, e]) => `${plan} — ${e.cur} ${e.amount}/${e.interval} (${e.count} subs)`)
    .slice(0, 12);

  const money = (c: number, cur = "GBP") => `${cur} ${(c / 100).toFixed(0)}`;
  const evidence: string[] = [];
  if (k.painPoints.length) evidence.push(`Customer pain points: ${k.painPoints.join("; ")}`);
  if (k.objections.length) evidence.push(`Common objections: ${k.objections.join("; ")}`);
  if (k.winningPhrases.length) evidence.push(`Winning angles: ${k.winningPhrases.join("; ")}`);
  if (k.faqs.length) evidence.push(`FAQs: ${k.faqs.join("; ")}`);
  if (facts.length) evidence.push(`Known facts (ground truth): ${facts.map((f) => f.text).join(" | ")}`);
  if (!rev.error)
    evidence.push(
      `Live billing: net MRR ${money(rev.mrrCents, rev.currency)} from ${rev.payingSubs} paying subs (${rev.activeSubs} active incl. comped); revenue last 30d ${money(rev.revenue30dCents, rev.currency)}.`,
    );
  if (plans.length) evidence.push(`Active subscription plans:\n  ${plans.join("\n  ")}`);
  if (!mix.error && mix.chargeCount)
    evidence.push(
      `Revenue mix (90d): recurring ${money(mix.recurringCents, mix.currency)}, manual invoices ${money(mix.invoiceCents, mix.currency)}, one-off ${money(mix.otherCents, mix.currency)}. Top items: ${mix.items.slice(0, 6).map((i) => `${i.label} (${i.kind}, ${money(i.cents, mix.currency)})`).join("; ")}`,
    );
  if (!pipe.error && pipe.stages.length)
    evidence.push(`Sales pipeline stages: ${pipe.stages.map((s) => `${s.name} (${s.count})`).join(", ")}; win rate ${pipe.winRate == null ? "n/a" : Math.round(pipe.winRate * 100) + "%"}.`);
  if (voiceSamples.length)
    evidence.push(`Owner's real writing (infer voiceTone from this): ${voiceSamples.join(" ").slice(0, 800)}`);

  // The owner's direct interview answers are the highest-priority truth — put first.
  if (answers.length)
    evidence.unshift(
      "The owner answered these directly (treat as the highest-priority truth, above any inferred data):\n" +
        answers.map((x) => `Q: ${x.q}\nA: ${x.a.trim()}`).join("\n"),
    );

  if (evidence.length === 0)
    return { ok: false, error: "not_enough_evidence" };

  const system =
    "You draft a concise business profile from REAL evidence (learned from calls/emails, live " +
    "billing, pipeline). Ground every field in the evidence; where evidence is thin, give a short " +
    "best-inference and don't overclaim or invent specifics. Write in British English, plain and " +
    "specific. Return ONLY a JSON object with these string keys: oneLiner, offer, icp, pricing, " +
    "revenueModel, differentiators, voiceTone, priorities, constraints, notes. Use an empty string " +
    'for any field you genuinely cannot infer. Do NOT write "voiceSamples". For voiceTone, infer ' +
    "from the winning angles/FAQs if possible, else leave blank.";

  const user =
    `BUSINESS: ${name}\n\nEVIDENCE:\n${evidence.join("\n")}\n\n` +
    (existing ? `EXISTING DRAFT (improve it; keep what's already good):\n${JSON.stringify(existing)}\n\n` : "") +
    "Draft the profile as JSON.";

  const json = await chatJSON(system, user);
  if (!json || typeof json !== "object") return { ok: false, error: "no_draft" };

  const profile: BrandProfile = {};
  for (const f of PROFILE_FIELDS) {
    if (f.key === "voiceSamples") continue; // filled from the owner's real messages below
    const v = (json as Record<string, unknown>)[f.key];
    if (typeof v === "string" && v.trim()) profile[f.key] = v.trim().slice(0, 8000);
  }
  // Voice samples come from the owner's OWN recent sent messages, verbatim — not the LLM.
  if (voiceSamples.length) {
    profile.voiceSamples = voiceSamples.join("\n\n— — —\n\n");
  }
  return { ok: true, profile };
}
