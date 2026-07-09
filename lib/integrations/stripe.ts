import Stripe from "stripe";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { cred } from "@/lib/credentials";

/**
 * Stripe connector — one Stripe account per brand, keyed by env var.
 * Revenue is fetched live per brand (no DB dependency yet); we add a Supabase
 * sync for history/trends in a later step.
 */

const ENV_BY_ENTITY: Record<EntityKey, string> = {
  macaws: "STRIPE_KEY__MACAWS",
  "artificial-ignorance": "STRIPE_KEY__ARTIFICIAL_IGNORANCE",
  leonardo: "STRIPE_KEY__LEONARDO",
};

export function stripeKeyForEntity(entity: EntityKey): Promise<string | undefined> {
  return cred(ENV_BY_ENTITY[entity]);
}

export async function configuredStripeEntities(): Promise<EntityKey[]> {
  const checks = await Promise.all(
    ENTITIES.map(async (e) => ({ key: e.key, ok: Boolean(await stripeKeyForEntity(e.key)) })),
  );
  return checks.filter((c) => c.ok).map((c) => c.key);
}

export interface BrandRevenue {
  entityKey: EntityKey;
  name: string;
  mrrCents: number;
  revenue30dCents: number;
  activeSubs: number;
  currency: string;
  error?: string;
}

/** Normalise a subscription line to monthly minor units. */
function monthlyCents(
  unitAmount: number,
  quantity: number,
  interval: string,
  intervalCount: number,
): number {
  const perCycle = unitAmount * quantity;
  const perMonthFactor: Record<string, number> = {
    day: 365 / 12,
    week: 52 / 12,
    month: 1,
    year: 1 / 12,
  };
  const factor = perMonthFactor[interval] ?? 1;
  return (perCycle * factor) / (intervalCount || 1);
}

export async function getBrandRevenue(entity: EntityKey): Promise<BrandRevenue> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const key = await stripeKeyForEntity(entity);
  const base: BrandRevenue = {
    entityKey: entity,
    name,
    mrrCents: 0,
    revenue30dCents: 0,
    activeSubs: 0,
    currency: "GBP",
  };
  if (!key) return { ...base, error: "not_configured" };

  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });

  try {
    // --- MRR from active subscriptions (paginated, capped) ---
    let mrr = 0;
    let subs = 0;
    let currency = "";
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of res.data) {
        subs += 1;
        for (const item of sub.items.data) {
          const price = item.price;
          const unit = price.unit_amount;
          const rec = price.recurring;
          if (unit == null || !rec) continue; // skip metered/one-off
          if (!currency) currency = price.currency;
          mrr += monthlyCents(
            unit,
            item.quantity ?? 1,
            rec.interval,
            rec.interval_count ?? 1,
          );
        }
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1]?.id;
    }

    // --- Revenue in the last 30 days from succeeded charges (capped) ---
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    let revenue = 0;
    let chargeAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await stripe.charges.list({
        created: { gte: since },
        limit: 100,
        ...(chargeAfter ? { starting_after: chargeAfter } : {}),
      });
      for (const charge of res.data) {
        if (charge.paid && charge.status === "succeeded") {
          revenue += charge.amount - (charge.amount_refunded ?? 0);
          if (!currency) currency = charge.currency;
        }
      }
      if (!res.has_more || res.data.length === 0) break;
      chargeAfter = res.data[res.data.length - 1]?.id;
    }

    return {
      ...base,
      mrrCents: Math.round(mrr),
      revenue30dCents: revenue,
      activeSubs: subs,
      currency: (currency || "gbp").toUpperCase(),
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "stripe_error",
    };
  }
}
