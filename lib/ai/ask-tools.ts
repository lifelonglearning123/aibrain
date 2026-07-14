import { ENTITIES, type EntityKey } from "@/lib/entities";
import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "./openai";
import type { ToolDef } from "./openai";
import { getBrandRevenue, listBrandSubscriptions } from "@/lib/integrations/stripe";
import { getBrandPipeline, listTopDeals, getBrandMarketing } from "@/lib/integrations/ghl";
import { getBrandFinancials } from "@/lib/integrations/accounting";
import { getBrandAdSpend } from "@/lib/integrations/facebook-ads";

/**
 * Ask-your-data tools — read-only "sensors" the model can call (function-calling)
 * to fetch LIVE business data before answering. Every tool is access-scoped: the
 * brand enum only contains companies this user may see, and runTool re-validates
 * the requested brand against that list so a user can never read another company.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AskCtx {
  brands: EntityKey[];
  isOwner: boolean;
}

function money(cents: number): number {
  return Math.round(cents) / 100;
}

/** Map a model-supplied brand (key or name) to an allowed EntityKey, or null. */
function resolveBrand(input: unknown, ctx: AskCtx): EntityKey | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return ctx.brands.length === 1 ? ctx.brands[0] : null;
  const match = ENTITIES.find(
    (e) => e.key === raw || e.name.toLowerCase() === raw || e.name.toLowerCase().includes(raw),
  );
  const key = (match?.key ?? raw) as EntityKey;
  return ctx.brands.includes(key) ? key : null;
}

const BRAND_HINT = ENTITIES.map((e) => `${e.key} = ${e.name}`).join(", ");

/** Tool schemas, with the brand enum limited to this user's companies. */
export function buildTools(ctx: AskCtx): ToolDef[] {
  const brandParam = {
    type: "string",
    enum: ctx.brands,
    description: `Which company to query. One of: ${BRAND_HINT}. You may only query: ${ctx.brands.join(", ")}.`,
  };
  const withBrand = (extra: Record<string, any> = {}, required = ["brand"]) => ({
    type: "object",
    properties: { brand: brandParam, ...extra },
    required,
    additionalProperties: false,
  });

  return [
    {
      type: "function",
      function: {
        name: "get_revenue",
        description:
          "Live Stripe revenue for a company: monthly recurring revenue (MRR), number of active subscriptions, and revenue collected in the last 30 days.",
        parameters: withBrand(),
      },
    },
    {
      type: "function",
      function: {
        name: "list_subscriptions",
        description:
          "The individual active Stripe subscriptions for a company — customer, plan, amount and billing interval. Use this for a subscriber-level MRR breakdown or 'who is paying'.",
        parameters: withBrand(),
      },
    },
    {
      type: "function",
      function: {
        name: "get_pipeline",
        description:
          "Live GHL sales pipeline for a company: open deals count and value, new deals in the last 7 days, win rate, and a breakdown by stage.",
        parameters: withBrand(),
      },
    },
    {
      type: "function",
      function: {
        name: "list_top_deals",
        description:
          "The largest OPEN deals in a company's GHL pipeline, by value — name, value, stage and contact.",
        parameters: withBrand({
          limit: { type: "integer", description: "How many deals to return (default 10, max 50)." },
        }),
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounting",
        description:
          "Income, expenses and net profit for the last 12 months from the company's accounting tool (Xero or QuickBooks). Use for profit/cost/cash questions.",
        parameters: withBrand(),
      },
    },
    {
      type: "function",
      function: {
        name: "get_marketing",
        description:
          "Marketing performance for a company: lead volume by source (GHL) and Facebook ad spend with cost-per-lead over the last 30 days.",
        parameters: withBrand(),
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge",
        description:
          "Search the learned knowledge base (insights from real sales calls, emails and Loom recaps) for qualitative evidence — objections, what wins deals, customer preferences, positioning. Use for 'why', 'what do customers say', pattern questions.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "What to search for, in natural language." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_daily_brief",
        description:
          "The most recent pre-computed Daily Brief (headline, per-brand snapshot, what needs attention, voice of customer, today's focus). Good background for 'how's the business' questions.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ];
}

const DENIED = { error: "no_access", note: "You cannot query that company." };

/** Execute a tool call, enforcing access. Always returns a JSON-safe object. */
export async function runTool(name: string, args: any, ctx: AskCtx): Promise<any> {
  switch (name) {
    case "get_revenue": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const r = await getBrandRevenue(brand);
      return {
        brand,
        mrr: money(r.mrrCents),
        activeSubscriptions: r.activeSubs,
        revenueLast30d: money(r.revenue30dCents),
        currency: r.currency,
        ...(r.error ? { note: r.error } : {}),
      };
    }

    case "list_subscriptions": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const r = await listBrandSubscriptions(brand);
      const total = r.subs.reduce((s, x) => s + (x.interval === "year" ? x.amount / 12 : x.amount), 0);
      return {
        brand,
        activeSubscriptions: r.count,
        approxMrr: Math.round(total * 100) / 100,
        currency: r.subs[0]?.currency ?? "GBP",
        subscriptions: r.subs.slice(0, 80).map((s) => ({
          customer: s.customer,
          plan: s.plan,
          amount: s.amount,
          interval: s.interval,
        })),
        ...(r.subs.length > 80 ? { truncated: `showing 80 of ${r.subs.length}` } : {}),
        ...(r.error ? { note: r.error } : {}),
      };
    }

    case "get_pipeline": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const p = await getBrandPipeline(brand);
      return {
        brand,
        openDeals: p.openCount,
        openValue: money(p.openValueCents),
        newLast7d: p.new7d,
        wonCount: p.wonCount,
        lostCount: p.lostCount,
        winRate: p.winRate == null ? null : Math.round(p.winRate * 100) + "%",
        currency: p.currency,
        topStages: p.stages.slice(0, 8).map((s) => ({
          stage: s.name,
          count: s.count,
          value: money(s.valueCents),
        })),
        ...(p.error ? { note: p.error } : {}),
      };
    }

    case "list_top_deals": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const limit = Number(args?.limit) || 10;
      const r = await listTopDeals(brand, limit);
      return {
        brand,
        currency: r.currency,
        deals: r.deals.map((d) => ({
          name: d.name,
          value: d.value,
          stage: d.stage,
          contact: d.contact,
        })),
        ...(r.error ? { note: r.error } : {}),
      };
    }

    case "get_accounting": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const f = await getBrandFinancials(brand);
      return {
        brand,
        period: "last 12 months",
        income: money(f.incomeCents),
        expenses: money(f.expensesCents),
        netProfit: money(f.netCents),
        currency: f.currency,
        ...(f.cashReceivedCents != null ? { cashReceived: money(f.cashReceivedCents) } : {}),
        ...(f.outstandingCents != null ? { outstandingOwed: money(f.outstandingCents) } : {}),
        ...(f.basisNote ? { basis: f.basisNote } : {}),
        ...(f.error ? { note: f.error } : {}),
      };
    }

    case "get_marketing": {
      const brand = resolveBrand(args?.brand, ctx);
      if (!brand) return DENIED;
      const [m, ads] = await Promise.all([getBrandMarketing(brand), getBrandAdSpend(brand)]);
      const cpl =
        ads.leads30d > 0 ? Math.round((ads.spend30dCents / ads.leads30d)) / 100 : null;
      return {
        brand,
        leads: {
          total: m.totalLeads,
          new30d: m.new30d,
          new7d: m.new7d,
          topSource: m.topSource,
          bySource: m.bySource.slice(0, 8),
        },
        ads: {
          spendLast30d: money(ads.spend30dCents),
          spendLast7d: money(ads.spend7dCents),
          leadsLast30d: ads.leads30d,
          costPerLead: cpl,
          currency: ads.currency,
          ...(ads.error ? { note: ads.error } : {}),
        },
        ...(m.error ? { leadsNote: m.error } : {}),
      };
    }

    case "search_knowledge": {
      const admin = createAdminClient();
      if (!admin) return { error: "store_unavailable" };
      const query = String(args?.query ?? "").trim();
      if (!query) return { results: [] };
      let rows: any[] = [];
      const v = await embed(query);
      if (v) {
        const { data } = await admin.rpc("match_brand_knowledge", {
          query_embedding: v,
          match_count: 24,
          allowed_brands: ctx.brands,
          include_shared: ctx.isOwner,
        });
        rows = data ?? [];
      }
      if (rows.length === 0) {
        let q = admin
          .from("brand_knowledge")
          .select("kind,text,converts,scope,entity_key")
          .eq("status", "active")
          .order("converts", { ascending: false })
          .limit(24);
        if (!ctx.isOwner) q = q.eq("scope", "brand").in("entity_key", ctx.brands);
        rows = (await q).data ?? [];
      }
      return {
        query,
        results: rows.map((r) => ({
          kind: r.kind,
          text: r.text,
          tiedToWonDeal: Boolean(r.converts),
          brand: r.entity_key ?? (r.scope === "shared" ? "portfolio" : null),
        })),
      };
    }

    case "get_daily_brief": {
      const admin = createAdminClient();
      if (!admin) return { error: "store_unavailable" };
      let q = admin
        .from("daily_briefs")
        .select("content")
        .order("created_at", { ascending: false })
        .limit(1);
      q = ctx.isOwner ? q.is("entity_key", null) : q.in("entity_key", ctx.brands);
      let content = (await q).data?.[0]?.content ?? null;
      if (!content && ctx.isOwner) {
        content =
          (
            await admin
              .from("daily_briefs")
              .select("content")
              .order("created_at", { ascending: false })
              .limit(1)
          ).data?.[0]?.content ?? null;
      }
      return content ?? { note: "no brief stored yet" };
    }

    default:
      return { error: `unknown_tool:${name}` };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
