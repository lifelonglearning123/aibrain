import { db } from "@/lib/goal-engine/engine/db/server";
import { decryptSecret } from "@/lib/goal-engine/engine/crypto";
import type { LocationCtx } from "@/lib/goal-engine/engine/ghl/client";

/**
 * Token provider (blueprint §2). Resolves a GHL bearer token + locationId for
 * an internal location id. Today it reads a private integration token
 * (app-encrypted, or Vault when enabled); when the Marketplace App ships it
 * returns a refreshed OAuth access token — callers don't change.
 */

export interface LocationRow {
  id: string;
  tenant_id: string;
  ghl_location_id: string;
  auth_type: "private_token" | "oauth";
  encrypted_token: string | null;
  timezone: string;
  quiet_start: number;
  quiet_end: number;
  active_channels: string[];
  business_profile: unknown;
  voice_consent_field: string | null;
  retell_voicemail_agent_id: string | null;
  retell_from_number: string | null;
}

const LOCATION_BASE_COLS =
  "id, tenant_id, ghl_location_id, auth_type, encrypted_token, timezone, quiet_start, quiet_end, active_channels, business_profile, voice_consent_field";
const LOCATION_VOICE_COLS = ", retell_voicemail_agent_id, retell_from_number";

export async function loadLocation(locationId: string): Promise<LocationRow | null> {
  // Try with the voicemail columns; the live DB may not have them yet (they were
  // added to the code ahead of the migration). On that schema-drift error, fall
  // back to the base columns — voicemail stays unconfigured, which executeStep
  // already handles by advancing past voicemail steps.
  let { data, error } = await db()
    .from("locations")
    .select(LOCATION_BASE_COLS + LOCATION_VOICE_COLS)
    .eq("id", locationId)
    .single();
  if (error) {
    ({ data, error } = await db()
      .from("locations")
      .select(LOCATION_BASE_COLS)
      .eq("id", locationId)
      .single());
    if (error) return null;
  }
  const row = data as Partial<LocationRow>;
  return {
    ...(row as LocationRow),
    retell_voicemail_agent_id: row.retell_voicemail_agent_id ?? null,
    retell_from_number: row.retell_from_number ?? null,
  };
}

/** Resolve the API context (token + ghl_location_id) for a location. */
export async function resolveLocationCtx(locationId: string): Promise<LocationCtx> {
  const loc = await loadLocation(locationId);
  if (!loc) throw new Error(`Unknown location ${locationId}`);
  const token = await decryptLocationToken(loc);
  return { token, locationId: loc.ghl_location_id };
}

async function decryptLocationToken(loc: LocationRow): Promise<string> {
  // Prefer Supabase Vault (keeps secrets out of app memory/logs) when enabled.
  if (process.env.SUPABASE_VAULT_ENABLED === "true") {
    const { data, error } = await db().rpc("get_location_token", { p_location_id: loc.id });
    if (!error && typeof data === "string" && data) return data;
  }
  // Pilot path: app-level AES-GCM decrypt of the stored token.
  if (loc.encrypted_token) return decryptSecret(loc.encrypted_token);
  throw new Error(`No token stored for location ${loc.id}`);
}
