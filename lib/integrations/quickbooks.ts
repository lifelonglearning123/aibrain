import { ENTITIES, type EntityKey } from "@/lib/entities";
import { createAdminClient } from "@/lib/supabase/admin";
import { cred } from "@/lib/credentials";

/**
 * QuickBooks Online connector — OAuth2 per brand (company).
 * Tokens live in Supabase (oauth_connections); access tokens auto-refresh.
 * Financials come from the Profit & Loss report (expenses + net income).
 */

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

export async function quickbooksConfig() {
  const clientId = await cred("QUICKBOOKS_CLIENT_ID");
  const clientSecret = await cred("QUICKBOOKS_CLIENT_SECRET");
  const redirectUri = await cred("QUICKBOOKS_REDIRECT_URI");
  const environment = ((await cred("QUICKBOOKS_ENVIRONMENT")) ?? "production").toLowerCase();
  return {
    clientId,
    clientSecret,
    redirectUri,
    environment,
    apiBase:
      environment === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com",
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

/** Build the Intuit consent URL for a brand. `state` carries the brand key. */
export async function authorizeUrl(entity: EntityKey): Promise<string | null> {
  const { clientId, redirectUri, configured } = await quickbooksConfig();
  if (!configured || !clientId || !redirectUri) return null;
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", entity);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse | null> {
  const { clientId, clientSecret } = await quickbooksConfig();
  if (!clientId || !clientSecret) return null;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TokenResponse;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string): Promise<TokenResponse | null> {
  const { redirectUri } = await quickbooksConfig();
  if (!redirectUri) return null;
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

export async function storeTokens(
  entity: EntityKey,
  realmId: string,
  tokens: TokenResponse,
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await admin.from("oauth_connections").upsert(
    {
      provider: "quickbooks",
      entity_key: entity,
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,entity_key" },
  );
  return !error;
}

async function getValidAccessToken(
  entity: EntityKey,
): Promise<{ accessToken: string; realmId: string } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("oauth_connections")
    .select("realm_id, access_token, refresh_token, expires_at")
    .eq("provider", "quickbooks")
    .eq("entity_key", entity)
    .maybeSingle();
  if (!data || !data.realm_id) return null;

  let accessToken: string = data.access_token;
  const expired =
    !data.expires_at || new Date(data.expires_at).getTime() < Date.now() + 60_000;
  if (expired) {
    if (!data.refresh_token) return null;
    const refreshed = await refreshTokens(data.refresh_token);
    if (!refreshed) return null;
    await storeTokens(entity, data.realm_id, refreshed);
    accessToken = refreshed.access_token;
  }
  return { accessToken, realmId: data.realm_id };
}

export interface BrandFinancials {
  entityKey: EntityKey;
  name: string;
  /** Figures cover the last 12 months (accounting data lags, so 30d is often blank). */
  incomeCents: number;
  expensesCents: number;
  netCents: number;
  currency: string;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseProfitAndLoss(report: any): {
  incomeCents: number;
  expensesCents: number;
  netCents: number;
  currency: string;
} {
  const currency = report?.Header?.Currency ?? "GBP";
  const found: Record<string, number> = {};
  const walk = (rows: any[]) => {
    for (const row of rows ?? []) {
      const group: string | undefined = row?.group;
      const cols: any[] | undefined = row?.Summary?.ColData;
      if (group && cols && cols.length) {
        const val = parseFloat(cols[cols.length - 1]?.value ?? "0");
        if (!Number.isNaN(val)) found[group] = val;
      }
      if (row?.Rows?.Row) walk(row.Rows.Row);
    }
  };
  walk(report?.Rows?.Row ?? []);
  const income = found["Income"] ?? 0;
  const expenses = found["Expenses"] ?? 0;
  const net = found["NetIncome"] ?? income - expenses;
  return {
    incomeCents: Math.round(income * 100),
    expensesCents: Math.round(expenses * 100),
    netCents: Math.round(net * 100),
    currency,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getBrandFinancials(entity: EntityKey): Promise<BrandFinancials> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const base: BrandFinancials = {
    entityKey: entity,
    name,
    incomeCents: 0,
    expensesCents: 0,
    netCents: 0,
    currency: "GBP",
  };
  const cfg = await quickbooksConfig();
  if (!cfg.configured) return { ...base, error: "not_configured" };

  const tok = await getValidAccessToken(entity);
  if (!tok) return { ...base, error: "not_connected" };

  const start = ymd(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
  const end = ymd(new Date());
  const url = `${cfg.apiBase}/v3/company/${tok.realmId}/reports/ProfitAndLoss?start_date=${start}&end_date=${end}&minorversion=70`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok.accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ...base, error: `http_${res.status}` };
    const parsed = parseProfitAndLoss(await res.json());
    return {
      ...base,
      incomeCents: parsed.incomeCents,
      expensesCents: parsed.expensesCents,
      netCents: parsed.netCents,
      currency: parsed.currency.toUpperCase(),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "quickbooks_error" };
  }
}
