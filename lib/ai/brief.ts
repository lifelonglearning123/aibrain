import { chatJSON } from "./openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { configuredStripeEntities, getBrandRevenue } from "@/lib/integrations/stripe";
import {
  configuredGhlEntities,
  getBrandPipeline,
  getBrandMarketing,
} from "@/lib/integrations/ghl";
import { accountingConfig, getBrandFinancials } from "@/lib/integrations/accounting";
import { configuredFacebookEntities, getBrandAdSpend } from "@/lib/integrations/facebook-ads";
import { getBrandKnowledge } from "@/lib/knowledge";
import { formatMoney } from "@/lib/money";

/**
 * Daily Brief — gathers live data across all brands, then synthesises a concise
 * morning briefing with gpt-5.5. Stored in daily_briefs (pre-generated so it's
 * instant when you open the app).
 */

export interface Brief {
  headline: string;
  brands: { name: string; snapshot: string }[];
  voiceOfCustomer: string[];
  needsAttention: string[];
  todayFocus: string[];
}

interface BrandData {
  key: EntityKey;
  name: string;
  data: string;
  insights: string[];
}

async function gatherBrand(
  entity: EntityKey,
  opts: { stripe: boolean; ghl: boolean; acct: boolean; fb: boolean },
): Promise<BrandData> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const parts: string[] = [];
  let revenue30: number | null = null;
  let leads30: number | null = null;

  if (opts.stripe) {
    const r = await getBrandRevenue(entity);
    if (!r.error) {
      revenue30 = r.revenue30dCents;
      const comped = r.activeSubs - r.payingSubs;
      parts.push(
        `Revenue 30d ${formatMoney(r.revenue30dCents, r.currency)}, MRR ${formatMoney(r.mrrCents, r.currency)} (net of discounts), ${r.payingSubs} paying subs${comped > 0 ? ` (+${comped} free/comped)` : ""}`,
      );
    }
  }
  if (opts.ghl) {
    const p = await getBrandPipeline(entity);
    if (!p.error)
      parts.push(
        `Pipeline: ${p.new7d} new deals (7d), ${p.openCount} open worth ${formatMoney(p.openValueCents, p.currency)}, win rate ${p.winRate != null ? Math.round(p.winRate * 100) + "%" : "n/a"}`,
      );
    const m = await getBrandMarketing(entity);
    if (!m.error) {
      leads30 = m.new30d;
      parts.push(`Leads: ${m.new30d} (30d), top source ${m.topSource ?? "n/a"}`);
    }
  }
  if (opts.fb) {
    const ad = await getBrandAdSpend(entity);
    if (!ad.error) {
      const cpl =
        leads30 && leads30 > 0 && ad.spend30dCents > 0
          ? formatMoney(Math.round(ad.spend30dCents / leads30), ad.currency)
          : "n/a";
      const roas =
        revenue30 != null && ad.spend30dCents > 0
          ? `${(revenue30 / ad.spend30dCents).toFixed(1)}x`
          : "n/a";
      parts.push(
        `Facebook ad spend 30d ${formatMoney(ad.spend30dCents, ad.currency)} (cost/lead ${cpl}, ROAS ${roas})`,
      );
    }
  }
  if (opts.acct) {
    const f = await getBrandFinancials(entity);
    if (!f.error)
      parts.push(
        `Expenses 12mo ${formatMoney(f.expensesCents, f.currency)}, net 12mo ${formatMoney(f.netCents, f.currency)}`,
      );
  }

  const k = await getBrandKnowledge(entity);
  const insights = [...k.objections, ...k.painPoints].slice(0, 4);

  return { key: entity, name, data: parts.join("; ") || "no data connected", insights };
}

export async function buildBriefData(): Promise<BrandData[]> {
  const [stripeSet, ghlSet, fbSet, acct] = await Promise.all([
    configuredStripeEntities(),
    configuredGhlEntities(),
    configuredFacebookEntities(),
    accountingConfig(),
  ]);
  return Promise.all(
    ENTITIES.map((e) =>
      gatherBrand(e.key, {
        stripe: stripeSet.includes(e.key),
        ghl: ghlSet.includes(e.key),
        fb: fbSet.includes(e.key),
        acct: acct.anyConfigured,
      }),
    ),
  );
}

function arr(x: unknown): string[] {
  return Array.isArray(x) ? x.map(String).filter(Boolean) : [];
}

export async function synthesizeBrief(perBrand: BrandData[]): Promise<Brief | null> {
  const block = perBrand
    .map(
      (b) =>
        `## ${b.name}\nData: ${b.data}\nCustomer signals: ${b.insights.join("; ") || "none yet"}`,
    )
    .join("\n\n");

  const system =
    "You are the owner's AI business brain. Write a concise, specific MORNING BRIEF across their " +
    "brands using the REAL numbers provided. Be direct and useful — no filler. Return ONLY JSON: " +
    '{"headline":"the single most important thing right now","brands":[{"name":"...","snapshot":' +
    '"one punchy line with the key numbers"}],"voiceOfCustomer":["what customers/calls are saying — ' +
    '2-4 items"],"needsAttention":["2-4 concrete, prioritised things to act on"],"todayFocus":' +
    '["1-3 suggested focuses for today"]}.';

  const user = `Today's data across the brands:\n\n${block}\n\nWrite the brief as JSON.`;

  const json = (await chatJSON(system, user)) as Record<string, unknown> | null;
  if (!json) return null;
  return {
    headline: String(json.headline ?? ""),
    brands: Array.isArray(json.brands)
      ? (json.brands as Record<string, unknown>[]).map((b) => ({
          name: String(b.name ?? ""),
          snapshot: String(b.snapshot ?? ""),
        }))
      : [],
    voiceOfCustomer: arr(json.voiceOfCustomer),
    needsAttention: arr(json.needsAttention),
    todayFocus: arr(json.todayFocus),
  };
}

/**
 * Builds and stores briefs. Each company gets its own brief (entity_key = key)
 * so partners only ever read their own; owners also get a portfolio-wide brief
 * (entity_key = null). Pass `scope` to limit which companies are built/returned
 * (e.g. a partner regenerating only their brand).
 *
 * Returns the brief to show the caller: the portfolio brief when `portfolio` is
 * true, otherwise the single requested brand's brief.
 */
export async function buildAndStoreBrief(opts?: {
  scope?: EntityKey[];
  portfolio?: boolean;
}): Promise<Brief | null> {
  const portfolio = opts?.portfolio ?? true;
  const admin = createAdminClient();

  const all = await buildBriefData();
  const scoped = opts?.scope ? all.filter((b) => opts.scope!.includes(b.key)) : all;

  // Per-brand briefs.
  const brandBriefs = new Map<EntityKey, Brief>();
  for (const b of scoped) {
    const single = await synthesizeBrief([b]);
    if (single) {
      brandBriefs.set(b.key, single);
      if (admin) await admin.from("daily_briefs").insert({ content: single, entity_key: b.key });
    }
  }

  // Portfolio brief (owner view) — only when building the whole portfolio.
  let portfolioBrief: Brief | null = null;
  if (portfolio) {
    portfolioBrief = await synthesizeBrief(all);
    if (admin && portfolioBrief)
      await admin.from("daily_briefs").insert({ content: portfolioBrief, entity_key: null });
  }

  if (portfolio) return portfolioBrief;
  // Partner-scoped single brand: return that brand's brief.
  return scoped.length === 1 ? (brandBriefs.get(scoped[0].key) ?? null) : portfolioBrief;
}
