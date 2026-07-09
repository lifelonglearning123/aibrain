import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Credential resolver. Values entered from the Settings page live in Supabase
 * (app_credentials, service-role only). Reads prefer the DB value, then fall
 * back to a matching env var — so both the UI and .env.local work.
 */

let cache: { data: Record<string, string>; at: number } | null = null;
const TTL_MS = 15_000;

async function load(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const admin = createAdminClient();
  const data: Record<string, string> = {};
  if (admin) {
    const { data: rows } = await admin.from("app_credentials").select("name, value");
    for (const r of rows ?? []) {
      if (r?.name && typeof r.value === "string" && r.value.length) data[r.name] = r.value;
    }
  }
  cache = { data, at: Date.now() };
  return data;
}

export function bustCredentialCache() {
  cache = null;
}

/** Read a credential: DB value first, then env var. */
export async function cred(name: string): Promise<string | undefined> {
  const db = await load();
  if (db[name]) return db[name];
  const env = process.env[name];
  return env && env.length ? env : undefined;
}

/** True if a credential is set (DB or env). */
export async function credSet(name: string): Promise<boolean> {
  return Boolean(await cred(name));
}

/** Names of all credentials that have a value in the DB (for prefix scans). */
export async function dbCredentialNames(): Promise<string[]> {
  return Object.keys(await load());
}

/** Does any credential (DB or env) start with the given prefix and have a value? */
export async function anyCredWithPrefix(prefix: string): Promise<boolean> {
  const db = await load();
  if (Object.keys(db).some((k) => k.startsWith(prefix))) return true;
  return Object.keys(process.env).some((k) => k.startsWith(prefix) && Boolean(process.env[k]));
}

/** Upsert credentials from the Settings page (server-only, service role). */
export async function saveCredentials(values: Record<string, string>): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const rows = Object.entries(values)
    .filter(([name, v]) => name && typeof v === "string" && v.trim().length > 0)
    .map(([name, value]) => ({ name, value: value.trim(), updated_at: new Date().toISOString() }));
  if (rows.length === 0) return true;
  const { error } = await admin.from("app_credentials").upsert(rows, { onConflict: "name" });
  bustCredentialCache();
  return !error;
}

/** True once Supabase is configured (needed to store credentials from the UI). */
export function credentialStoreAvailable(): boolean {
  return Boolean(createAdminClient());
}
