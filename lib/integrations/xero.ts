import { ENTITIES, type EntityKey } from "@/lib/entities";
import { createAdminClient } from "@/lib/supabase/admin";
import { cred } from "@/lib/credentials";
import type { BrandFinancials } from "@/lib/integrations/quickbooks";

/**
 * Xero connector — OAuth2 per brand (organisation). Mirrors the QuickBooks
 * connector: tokens live in Supabase (oauth_connections, provider='xero'),
 * access tokens auto-refresh (refresh tokens rotate — we store the new one).
 * Financials come from the Profit & Loss report (income, expenses, net).
 */

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";
// offline_access → refresh tokens; accounting.reports.read → P&L.
const SCOPE = "offline_access accounting.reports.read";

export async function xeroConfig() {
  const clientId = await cred("XERO_CLIENT_ID");
  const clientSecret = await cred("XERO_CLIENT_SECRET");
  const redirectUri = await cred("XERO_REDIRECT_URI");
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

/** Build the Xero consent URL for a brand. `state` carries the brand key. */
export async function authorizeUrl(entity: EntityKey): Promise<string | null> {
  const { clientId, redirectUri, configured } = await xeroConfig();
  if (!configured || !clientId || !redirectUri) return null;
  // Build the query manually: the scope separator MUST be %20, not "+" (which
  // URLSearchParams produces) — Xero rejects "+" with invalid_scope.
  const query = [
    `response_type=code`,
    `client_id=${encodeURIComponent(clientId)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `scope=${encodeURIComponent(SCOPE)}`,
    `state=${encodeURIComponent(entity)}`,
  ].join("&");
  return `${AUTH_URL}?${query}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse | null> {
  const { clientId, clientSecret } = await xeroConfig();
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
  const { redirectUri } = await xeroConfig();
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/** After OAuth, list the connected organisations and return the first tenant id. */
export async function fetchTenantId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const list: any[] = await res.json();
    const org = list.find((c) => c?.tenantType === "ORGANISATION") ?? list[0];
    return org?.tenantId ? String(org.tenantId) : null;
  } catch {
    return null;
  }
}

export async function storeTokens(
  entity: EntityKey,
  tenantId: string,
  tokens: TokenResponse,
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await admin.from("oauth_connections").upsert(
    {
      provider: "xero",
      entity_key: entity,
      realm_id: tenantId, // Xero tenant id reuses the realm_id column
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
): Promise<{ accessToken: string; tenantId: string } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("oauth_connections")
    .select("realm_id, access_token, refresh_token, expires_at")
    .eq("provider", "xero")
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
  return { accessToken, tenantId: data.realm_id };
}

/** Parse a Xero ProfitAndLoss report into income / expenses / net (in cents). */
function parseProfitAndLoss(report: any): {
  incomeCents: number;
  expensesCents: number;
  netCents: number;
} {
  const found: Record<string, number> = {};
  const walk = (rows: any[]) => {
    for (const row of rows ?? []) {
      const cells: any[] | undefined = row?.Cells;
      if (Array.isArray(cells) && cells.length >= 2) {
        const label = String(cells[0]?.Value ?? "").trim().toLowerCase();
        const raw = String(cells[cells.length - 1]?.Value ?? "").replace(/,/g, "");
        const val = parseFloat(raw);
        if (label && !Number.isNaN(val)) found[label] = val;
      }
      if (row?.Rows) walk(row.Rows);
    }
  };
  walk(report?.Reports?.[0]?.Rows ?? []);

  const pick = (re: RegExp): number | undefined => {
    for (const k of Object.keys(found)) if (re.test(k)) return found[k];
    return undefined;
  };
  const income = pick(/^total (income|revenue|operating income)/) ?? 0;
  const expenses =
    pick(/^total (operating )?expenses/) ?? pick(/total.*expenses/) ?? 0;
  const net = pick(/net profit/) ?? pick(/^profit(\/\(loss\))?$/) ?? income - expenses;
  return {
    incomeCents: Math.round(income * 100),
    expensesCents: Math.round(expenses * 100),
    netCents: Math.round(net * 100),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getBrandFinancials(entity: EntityKey): Promise<BrandFinancials> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const currencyOverride = await cred(
    `ACCOUNTING_CURRENCY__${entity.toUpperCase().replace(/-/g, "_")}`,
  );
  const base: BrandFinancials = {
    entityKey: entity,
    name,
    income30dCents: 0,
    expenses30dCents: 0,
    netCents: 0,
    currency: currencyOverride ?? "GBP",
  };
  if (!(await xeroConfig()).configured) return { ...base, error: "not_configured" };

  const tok = await getValidAccessToken(entity);
  if (!tok) return { ...base, error: "not_connected" };

  const from = ymd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const to = ymd(new Date());
  const url = `${API_BASE}/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        "Xero-tenant-id": tok.tenantId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return { ...base, error: `http_${res.status}` };
    const parsed = parseProfitAndLoss(await res.json());
    return {
      ...base,
      income30dCents: parsed.incomeCents,
      expenses30dCents: parsed.expensesCents,
      netCents: parsed.netCents,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "xero_error" };
  }
}
