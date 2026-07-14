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
  /** NET MRR — after coupons/discounts. 100%-off (test) subs count as £0. */
  mrrCents: number;
  /** Gross MRR at list price (before discounts) — for reference / to show the gap. */
  grossMrrCents: number;
  revenue30dCents: number;
  /** All active subscriptions (incl. fully-discounted). */
  activeSubs: number;
  /** Subscriptions actually paying > £0 after discounts. */
  payingSubs: number;
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Effective ongoing discount on a subscription. Only 'forever'/'repeating'
 * coupons reduce steady-state MRR — a 'once' coupon just discounts the first
 * invoice. Returns a percent (0–100) and any fixed amount off (minor units).
 * Requires the subscription to be listed with expand[]=data.discounts.
 */
function subscriptionDiscount(sub: any): { percentOff: number; amountOffCents: number } {
  let percentOff = 0;
  let amountOffCents = 0;
  const discs: any[] = [];
  if (Array.isArray(sub?.discounts)) discs.push(...sub.discounts);
  if (sub?.discount) discs.push(sub.discount);
  for (const d of discs) {
    const c = d && typeof d === "object" ? d.coupon : null;
    if (!c || typeof c !== "object") continue;
    if (c.duration === "once") continue; // doesn't affect ongoing MRR
    if (typeof c.percent_off === "number" && c.percent_off) {
      percentOff = Math.max(percentOff, c.percent_off);
    }
    if (typeof c.amount_off === "number" && c.amount_off) {
      amountOffCents += c.amount_off;
    }
  }
  return { percentOff: Math.min(percentOff, 100), amountOffCents };
}

/** Apply a subscription's discount to a gross monthly figure (minor units). */
function netMonthly(grossCents: number, sub: any): number {
  const { percentOff, amountOffCents } = subscriptionDiscount(sub);
  return Math.max(0, grossCents * (1 - percentOff / 100) - amountOffCents);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SubscriptionLine {
  customer: string;
  plan: string;
  /** What they actually pay per interval after discounts (major units). */
  amount: number;
  /** List price per interval before discounts (major units). */
  listPrice: number;
  interval: string;
  status: string;
  currency: string;
  /** True when a coupon (e.g. 100% off) reduces the price. */
  discounted: boolean;
  /** True when the net amount is £0 — a comp/test account, not real revenue. */
  free: boolean;
}

/**
 * Live list of active subscriptions with per-customer plan + NET amount (after
 * discounts) — the detail Ask needs for a "subscriber-level MRR breakdown",
 * with 100%-off test/comp accounts flagged so they're not counted as revenue.
 */
export async function listBrandSubscriptions(
  entity: EntityKey,
): Promise<{ subs: SubscriptionLine[]; count: number; error?: string }> {
  const key = await stripeKeyForEntity(entity);
  if (!key) return { subs: [], count: 0, error: "not_configured" };
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  try {
    const subs: SubscriptionLine[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 5; page++) {
      const res = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.customer", "data.discounts"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of res.data) {
        const cust = sub.customer as Stripe.Customer | Stripe.DeletedCustomer | string;
        const customer =
          typeof cust === "object" && cust
            ? ("name" in cust && cust.name) || ("email" in cust && cust.email) || cust.id
            : String(cust);
        const { percentOff, amountOffCents } = subscriptionDiscount(sub);
        // Gross across the whole subscription, to allocate any fixed amount-off.
        const subGross = sub.items.data.reduce((s, it) => {
          const p = it.price;
          return p.unit_amount != null && p.recurring ? s + p.unit_amount * (it.quantity ?? 1) : s;
        }, 0);
        for (const item of sub.items.data) {
          const price = item.price;
          if (price.unit_amount == null || !price.recurring) continue; // skip metered/one-off
          const listMinor = price.unit_amount * (item.quantity ?? 1);
          const amountOffShare =
            subGross > 0 ? amountOffCents * (listMinor / subGross) : 0;
          const netMinor = Math.max(0, listMinor * (1 - percentOff / 100) - amountOffShare);
          const plan =
            price.nickname ||
            `${(listMinor / 100).toFixed(2)} ${price.currency.toUpperCase()}/${price.recurring.interval}`;
          subs.push({
            customer: String(customer),
            plan,
            amount: Math.round(netMinor) / 100,
            listPrice: listMinor / 100,
            interval: price.recurring.interval,
            status: sub.status,
            currency: price.currency.toUpperCase(),
            discounted: percentOff > 0 || amountOffCents > 0,
            free: netMinor < 1,
          });
        }
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1]?.id;
    }
    return { subs, count: subs.length };
  } catch (e) {
    return { subs: [], count: 0, error: e instanceof Error ? e.message : "stripe_error" };
  }
}

export async function getBrandRevenue(entity: EntityKey): Promise<BrandRevenue> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const key = await stripeKeyForEntity(entity);
  const base: BrandRevenue = {
    entityKey: entity,
    name,
    mrrCents: 0,
    grossMrrCents: 0,
    revenue30dCents: 0,
    activeSubs: 0,
    payingSubs: 0,
    currency: "GBP",
  };
  if (!key) return { ...base, error: "not_configured" };

  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });

  try {
    // --- MRR from active subscriptions (paginated, capped) ---
    // NET of discounts: a 100%-off (test) subscription contributes £0, so the
    // number reflects real recurring revenue, not sticker prices.
    let netMrr = 0;
    let grossMrr = 0;
    let subs = 0;
    let paying = 0;
    let currency = "";
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.discounts"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const sub of res.data) {
        subs += 1;
        let subGross = 0;
        for (const item of sub.items.data) {
          const price = item.price;
          const unit = price.unit_amount;
          const rec = price.recurring;
          if (unit == null || !rec) continue; // skip metered/one-off
          if (!currency) currency = price.currency;
          subGross += monthlyCents(unit, item.quantity ?? 1, rec.interval, rec.interval_count ?? 1);
        }
        const subNet = netMonthly(subGross, sub);
        grossMrr += subGross;
        netMrr += subNet;
        if (subNet >= 1) paying += 1; // paying more than ~1p after discount
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
      mrrCents: Math.round(netMrr),
      grossMrrCents: Math.round(grossMrr),
      revenue30dCents: revenue,
      activeSubs: subs,
      payingSubs: paying,
      currency: (currency || "gbp").toUpperCase(),
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "stripe_error",
    };
  }
}

export interface RevenueMixItem {
  label: string;
  kind: "subscription" | "invoice" | "other";
  cents: number;
  count: number;
}
export interface RevenueMix {
  entityKey: EntityKey;
  name: string;
  currency: string;
  windowDays: number;
  chargeCount: number;
  /** Cash from true Stripe subscriptions (genuinely recurring). */
  recurringCents: number;
  /** Cash from manual / GHL invoices (often recurring services billed one-off). */
  invoiceCents: number;
  /** Ad-hoc payments with no invoice/subscription. */
  otherCents: number;
  items: RevenueMixItem[];
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function cleanLabel(s: string): string {
  return String(s || "")
    .replace(/^\d+\s*×\s*/, "")
    .replace(/\s*\(at .*$/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Recurring-vs-transactional revenue mix from cash actually collected in a
 * window. Classifies each succeeded charge as a true Stripe subscription, a
 * manual/GHL invoice (recurring services are often billed this way, so they
 * hide from MRR), or other ad-hoc. Read-only.
 */
export async function getBrandRevenueMix(
  entity: EntityKey,
  windowDays = 30,
): Promise<RevenueMix> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const base: RevenueMix = {
    entityKey: entity,
    name,
    currency: "GBP",
    windowDays,
    chargeCount: 0,
    recurringCents: 0,
    invoiceCents: 0,
    otherCents: 0,
    items: [],
  };
  const key = await stripeKeyForEntity(entity);
  if (!key) return { ...base, error: "not_configured" };
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });

  const since = Math.floor((Date.now() - windowDays * 24 * 60 * 60 * 1000) / 1000);
  const agg = new Map<string, RevenueMixItem>();
  let currency = "";
  try {
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await stripe.charges.list({
        created: { gte: since },
        limit: 100,
        expand: ["data.invoice"],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const charge of res.data) {
        if (!charge.paid || charge.status !== "succeeded") continue;
        const net = charge.amount - (charge.amount_refunded ?? 0);
        if (net <= 0) continue;
        if (!currency) currency = charge.currency;
        base.chargeCount += 1;

        const meta = (charge.metadata ?? {}) as Record<string, string>;
        const inv = (charge as any).invoice; // expanded object or id (not in pinned types)
        const invObj = inv && typeof inv === "object" ? inv : null;
        const desc = String(charge.description ?? "");

        let kind: RevenueMixItem["kind"];
        let label: string;
        if (inv) {
          // Any Stripe-native invoice = subscription / Stripe invoicing (recurring).
          kind = "subscription";
          label =
            cleanLabel(invObj?.lines?.data?.[0]?.description) ||
            cleanLabel(desc) ||
            "Subscription";
          base.recurringCents += net;
        } else if (meta.invoiceNumber || meta.invoiceId || /payment for invoice/i.test(desc)) {
          kind = "invoice";
          label = meta.invoiceNumber ? `Invoice ${meta.invoiceNumber}` : "Manual invoice";
          base.invoiceCents += net;
        } else {
          kind = "other";
          label = cleanLabel(desc) || "One-off payment";
          base.otherCents += net;
        }

        const k = `${kind}::${label}`;
        const existing = agg.get(k);
        if (existing) {
          existing.cents += net;
          existing.count += 1;
        } else {
          agg.set(k, { label, kind, cents: net, count: 1 });
        }
      }
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1]?.id;
    }

    return {
      ...base,
      currency: (currency || "gbp").toUpperCase(),
      items: [...agg.values()].sort((a, b) => b.cents - a.cents),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "stripe_error" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
