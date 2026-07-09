import { createClient } from "@supabase/supabase-js";
import { cred } from "@/lib/credentials";

/**
 * Signal connector — read-only access to Signal's own Supabase `calls` table.
 * We deliberately do NOT read caller/receiver numbers or names — only the
 * anonymised summary, topic tag, direction and the booking outcome. That
 * booking outcome (booked_at) is a built-in call→conversion signal.
 */

export async function signalConfig() {
  const url = await cred("SIGNAL_SUPABASE_URL");
  const key = await cred("SIGNAL_SUPABASE_SERVICE_KEY");
  return { url, key, configured: Boolean(url && key) };
}

export interface SignalCall {
  startedAt: string | null;
  direction: string | null;
  durationSec: number | null;
  topic: string | null;
  summary: string | null;
  booked: boolean;
  clientId: string | null;
  agencyId: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Fetch recent calls from Signal (anonymised fields only). */
export async function fetchRecentCalls(limit = 200): Promise<SignalCall[]> {
  const { url, key, configured } = await signalConfig();
  if (!configured || !url || !key) return [];
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("calls")
      .select(
        "started_at, direction, duration_sec, subject_tag, summary, booked_at, client_id, agency_id",
      )
      .not("summary", "is", null)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((c: any) => ({
      startedAt: c.started_at ?? null,
      direction: c.direction ?? null,
      durationSec: c.duration_sec ?? null,
      topic: c.subject_tag ?? null,
      summary: c.summary ?? null,
      booked: Boolean(c.booked_at),
      clientId: c.client_id ?? null,
      agencyId: c.agency_id ?? null,
    }));
  } catch {
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
