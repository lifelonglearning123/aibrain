import { db } from "@/lib/goal-engine/engine/db/server";
import { FlowSchema, type Flow } from "@/lib/goal-engine/engine/flow/schema";

/** Read/write the goal's editable flow. */

export async function loadGoalFlow(goalId: string): Promise<{ flow: Flow | null; status: "draft" | "live" }> {
  const { data } = await db().from("goals").select("flow, flow_status").eq("id", goalId).single();
  return { flow: safeParse(data?.flow), status: (data?.flow_status as "draft" | "live") ?? "draft" };
}

/** The goal's CTA link (booking/calendar/website), used to fill {{calendar_link}}-style
 *  merge tokens in flow content at send time. Null when the goal has no link set. */
export async function loadGoalTargetLink(goalId: string): Promise<string | null> {
  const { data } = await db().from("goals").select("target_link").eq("id", goalId).single();
  const link = (data?.target_link as string | null) ?? null;
  return link && link.trim() ? link.trim() : null;
}

export async function saveGoalFlow(goalId: string, flow: Flow, status?: "draft" | "live"): Promise<void> {
  const patch: Record<string, unknown> = { flow };
  if (status) patch.flow_status = status;
  await db().from("goals").update(patch).eq("id", goalId);
}

function safeParse(v: unknown): Flow | null {
  if (!v) return null;
  try {
    return FlowSchema.parse(v);
  } catch {
    return null;
  }
}
