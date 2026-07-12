import { createAdminClient } from "@/lib/supabase/admin";
import { cred } from "@/lib/credentials";

/**
 * Gmail connector — OAuth2, read-only. Used to pull Loom "Recap" emails (which
 * contain each meeting's AI summary + notes) into the knowledge base. Single
 * account (not per-brand); tokens stored in oauth_connections (provider='gmail',
 * entity_key='global'). Google refresh tokens don't rotate, so we preserve the
 * stored one across refreshes.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const KEY = "global"; // Gmail is one account, not per-brand

export async function gmailConfig() {
  const clientId = await cred("GMAIL_CLIENT_ID");
  const clientSecret = await cred("GMAIL_CLIENT_SECRET");
  const redirectUri = await cred("GMAIL_REDIRECT_URI");
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export async function authorizeUrl(): Promise<string | null> {
  const { clientId, redirectUri, configured } = await gmailConfig();
  if (!configured || !clientId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    state: KEY,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
  const { clientId, clientSecret, redirectUri } = await gmailConfig();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
  const { clientId, clientSecret } = await gmailConfig();
  if (!clientId || !clientSecret) return null;
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  );
}

export async function storeTokens(tokens: TokenResponse): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const row: Record<string, unknown> = {
    provider: "gmail",
    entity_key: KEY,
    access_token: tokens.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  // Google only returns refresh_token on first consent — preserve the stored one otherwise.
  if (tokens.refresh_token) row.refresh_token = tokens.refresh_token;
  const { error } = await admin
    .from("oauth_connections")
    .upsert(row, { onConflict: "provider,entity_key" });
  return !error;
}

async function getValidAccessToken(): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("oauth_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "gmail")
    .eq("entity_key", KEY)
    .maybeSingle();
  if (!data) return null;

  const expired = !data.expires_at || new Date(data.expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return data.access_token;
  if (!data.refresh_token) return null;
  const refreshed = await refreshTokens(data.refresh_token);
  if (!refreshed) return null;
  await storeTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? data.refresh_token });
  return refreshed.access_token;
}

/** True once a Gmail account is connected (a stored token exists). */
export async function gmailConnected(): Promise<boolean> {
  return (await getValidAccessToken()) !== null;
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string | null;
  text: string; // decoded text/plain body
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Walk the MIME tree and return the first text/plain body found. */
function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const t = extractPlainText(part);
    if (t) return t;
  }
  // Fallback: strip tags from HTML part if no plaintext exists.
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeB64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

function header(payload: any, name: string): string {
  const h = (payload?.headers ?? []).find(
    (x: any) => String(x.name).toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? "";
}

/** Search Gmail; returns message ids (newest first). Query is Gmail syntax. */
export async function searchMessageIds(query: string, max = 50): Promise<string[]> {
  const token = await getValidAccessToken();
  if (!token) return [];
  const ids: string[] = [];
  let pageToken: string | undefined;
  try {
    while (ids.length < max) {
      const params = new URLSearchParams({ q: query, maxResults: String(Math.min(100, max - ids.length)) });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`${API_BASE}/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) break;
      const data: any = await res.json();
      for (const m of data.messages ?? []) ids.push(m.id);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  } catch {
    /* ignore */
  }
  return ids.slice(0, max);
}

export async function getMessage(id: string): Promise<GmailMessage | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(id)}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      id,
      subject: header(data.payload, "Subject"),
      from: header(data.payload, "From"),
      date: header(data.payload, "Date") || null,
      text: extractPlainText(data.payload),
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
