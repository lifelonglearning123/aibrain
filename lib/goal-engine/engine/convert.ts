import { db } from "@/lib/goal-engine/engine/db/server";
import { resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { addNote, addTag } from "@/lib/goal-engine/engine/ghl/client";
import { reportCampaignOutcomes } from "@/lib/goal-engine/engine/brain";

/**
 * Mark a contact's active campaigns Converted and halt them — used when the
 * contact reaches the goal's target (books / fills the form / buys). Scoped to
 * specific goals when goalIds is given (e.g. only calendar-target goals for an
 * appointment event). Mirrors the conversion back into GHL as a note + tag.
 */
export async function markConverted(input: { locationId: string; ghlContactId: string; goalIds?: string[] }): Promise<number> {
  let q = db()
    .from("campaigns")
    .select("id")
    .eq("location_id", input.locationId)
    .eq("ghl_contact_id", input.ghlContactId)
    .in("status", ["running", "paused"]);
  if (input.goalIds?.length) q = q.in("goal_id", input.goalIds);

  const { data } = await q;
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return 0;

  await db().from("campaigns").update({ status: "converted" }).in("id", ids);
  await db().from("scheduled_steps").update({ done: true }).in("campaign_id", ids).eq("done", false);

  // Teach the Brain which angle won (best-effort — never blocks conversion).
  await reportCampaignOutcomes(ids, "converted");

  try {
    const ctx = await resolveLocationCtx(input.locationId);
    await addNote(ctx, input.ghlContactId, "AI: contact converted — sequence stopped.").catch(() => {});
    await addTag(ctx, input.ghlContactId, "ai-converted").catch(() => {});
  } catch {
    /* GHL note/tag is best-effort */
  }
  return ids.length;
}
