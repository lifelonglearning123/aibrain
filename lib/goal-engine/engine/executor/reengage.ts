import { db } from "@/lib/goal-engine/engine/db/server";
import { resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { getContact } from "@/lib/goal-engine/engine/ghl/client";
import { loadGoalFlow } from "@/lib/goal-engine/engine/flow/store";
import { scheduleStep } from "@/lib/goal-engine/engine/executor/schedule";

/**
 * Daily recycling (Ch 47 "recycle the list"): a contact who let the whole flow pass
 * without replying — or who gave a soft "not right now" — is re-worked after a
 * cooldown, capped, and only after a live compliance re-check.
 *
 *   - status filter: only 'exhausted' campaigns (opt-outs are 'opted_out', never here)
 *   - cooldown: at least COOLDOWN_DAYS since it went cold (exhausted_at)
 *   - cap: at most MAX_REENGAGE recycles per contact-campaign
 *   - live re-check: GHL DND + the ai-hard-no / ai-wrong-number tags, so a firm no,
 *     wrong number, or opt-out recorded on ANY campaign still excludes them
 *
 * Because campaigns run the GOAL's SHARED flow (there is no per-contact plan), a
 * recycle re-schedules that flow from step 0. Per-contact angle-repositioning would
 * need a goal-level "re-engagement flow variant" — not built here.
 */

const COOLDOWN_DAYS = 90;
const MAX_REENGAGE = 2;
const BATCH = 100; // capped per run; the rest recycle on the next day's cron
const EXCLUDE_TAGS = ["ai-hard-no", "ai-wrong-number"];

export async function runReengage(limit = BATCH): Promise<{ scanned: number; reengaged: number; skipped: number }> {
  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();

  const { data: cands } = await db()
    .from("campaigns")
    .select("id, goal_id, location_id, ghl_contact_id, reengage_count")
    .eq("status", "exhausted")
    .lte("exhausted_at", cutoff)
    .lt("reengage_count", MAX_REENGAGE)
    .order("exhausted_at", { ascending: true })
    .limit(limit);

  let reengaged = 0;
  let skipped = 0;

  for (const c of cands ?? []) {
    try {
      // Goal must still be active with a live flow.
      const { data: goal } = await db().from("goals").select("status").eq("id", c.goal_id).single();
      const { flow, status: flowStatus } = await loadGoalFlow(c.goal_id as string);
      if (goal?.status !== "active" || flowStatus !== "live" || !flow || flow.steps.length === 0) {
        skipped++;
        continue;
      }

      // Live compliance re-check: DND or an exclude tag kills it.
      const ctx = await resolveLocationCtx(c.location_id as string).catch(() => null);
      if (!ctx) { skipped++; continue; }
      const contact = await getContact(ctx, c.ghl_contact_id as string);
      if (!contact || contact.dnd) { skipped++; continue; }
      const tags = (contact.tags ?? []).map((t) => t.toLowerCase());
      if (EXCLUDE_TAGS.some((t) => tags.includes(t))) { skipped++; continue; }

      // Reuse the row: start a fresh cycle from step 0. The status guard makes this a
      // no-op if something moved it out of 'exhausted' since the scan. cycle_started_at
      // resets reply/open gating; the 0007 trigger clears exhausted_at on the flip.
      const { data: updated } = await db()
        .from("campaigns")
        .update({
          status: "running",
          current_step: 0,
          reengage_count: (c.reengage_count as number) + 1,
          cycle_started_at: new Date().toISOString(),
          last_opened_at: null,
        })
        .eq("id", c.id)
        .eq("status", "exhausted")
        .select("id");
      if (!updated?.length) { skipped++; continue; }

      await scheduleStep(c.id as string, 0, flow.steps, c.location_id as string);
      reengaged++;
    } catch {
      skipped++;
    }
  }

  return { scanned: cands?.length ?? 0, reengaged, skipped };
}
