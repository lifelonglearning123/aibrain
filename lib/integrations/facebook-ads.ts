import { ENTITIES, type EntityKey } from "@/lib/entities";
import { cred } from "@/lib/credentials";

/**
 * Facebook (Meta) Ads spend sensor — one long-lived access token + ad account per
 * brand. Reads spend, impressions, clicks and lead results from the Marketing API
 * Insights endpoint. Powers cost-per-lead and ROAS in the Marketing view + brief.
 *
 * Credentials per brand (Settings → Facebook Ads):
 *   FACEBOOK_ADS_TOKEN__<BRAND>     — a system-user or long-lived access token
 *   FACEBOOK_AD_ACCOUNT__<BRAND>    — the ad account id (act_XXXX or just XXXX)
 */

const GRAPH = "https://graph.facebook.com";

function suffix(key: EntityKey): string {
  return key.toUpperCase().replace(/-/g, "_");
}

export async function facebookAdsConfigForEntity(entity: EntityKey) {
  const token = await cred(`FACEBOOK_ADS_TOKEN__${suffix(entity)}`);
  const rawAccount = await cred(`FACEBOOK_AD_ACCOUNT__${suffix(entity)}`);
  const version = (await cred("FACEBOOK_API_VERSION")) ?? "v21.0";
  const accountId = rawAccount
    ? rawAccount.startsWith("act_")
      ? rawAccount
      : `act_${rawAccount}`
    : undefined;
  return { token, accountId, version, configured: Boolean(token && accountId) };
}

export async function configuredFacebookEntities(): Promise<EntityKey[]> {
  const checks = await Promise.all(
    ENTITIES.map(async (e) => ({ key: e.key, cfg: await facebookAdsConfigForEntity(e.key) })),
  );
  return checks.filter((c) => c.cfg.configured).map((c) => c.key);
}

export interface BrandAdSpend {
  entityKey: EntityKey;
  name: string;
  spend30dCents: number;
  spend7dCents: number;
  leads30d: number;
  impressions30d: number;
  clicks30d: number;
  currency: string;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function sumLeads(actions: any[]): number {
  if (!Array.isArray(actions)) return 0;
  // Lead-ad results surface under a few action types across account setups.
  return actions
    .filter((a) => typeof a?.action_type === "string" && a.action_type.includes("lead"))
    .reduce((s, a) => s + (Number(a.value) || 0), 0);
}

async function fetchInsights(
  version: string,
  accountId: string,
  token: string,
  datePreset: string,
): Promise<{ spendCents: number; leads: number; impressions: number; clicks: number; currency: string } | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const params = new URLSearchParams({
      fields: "spend,impressions,clicks,actions,account_currency",
      date_preset: datePreset,
      level: "account",
      access_token: token,
    });
    const res = await fetch(
      `${GRAPH}/${version}/${accountId}/insights?${params.toString()}`,
      { cache: "no-store", signal: controller.signal },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Bubble the Meta error message up via a thrown Error the caller catches.
      throw new Error(json?.error?.message ?? `http_${res.status}`);
    }
    const row = json?.data?.[0];
    if (!row) {
      return { spendCents: 0, leads: 0, impressions: 0, clicks: 0, currency: "GBP" };
    }
    return {
      spendCents: Math.round((Number(row.spend) || 0) * 100),
      leads: sumLeads(row.actions),
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      currency: row.account_currency ?? "GBP",
    };
  } finally {
    clearTimeout(t);
  }
}

export async function getBrandAdSpend(entity: EntityKey): Promise<BrandAdSpend> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const base: BrandAdSpend = {
    entityKey: entity,
    name,
    spend30dCents: 0,
    spend7dCents: 0,
    leads30d: 0,
    impressions30d: 0,
    clicks30d: 0,
    currency: "GBP",
  };
  const cfg = await facebookAdsConfigForEntity(entity);
  if (!cfg.configured || !cfg.token || !cfg.accountId) {
    return { ...base, error: "not_configured" };
  }
  try {
    const [d30, d7] = await Promise.all([
      fetchInsights(cfg.version, cfg.accountId, cfg.token, "last_30d"),
      fetchInsights(cfg.version, cfg.accountId, cfg.token, "last_7d"),
    ]);
    return {
      ...base,
      spend30dCents: d30?.spendCents ?? 0,
      spend7dCents: d7?.spendCents ?? 0,
      leads30d: d30?.leads ?? 0,
      impressions30d: d30?.impressions ?? 0,
      clicks30d: d30?.clicks ?? 0,
      currency: d30?.currency ?? d7?.currency ?? "GBP",
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "facebook_ads_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
