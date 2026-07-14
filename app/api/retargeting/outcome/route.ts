import { NextResponse } from "next/server";
import { checkApiSecret } from "@/lib/brain-api-auth";
import { recordOutcome } from "@/lib/ai/funnel-learning";

export const dynamic = "force-dynamic";

/**
 * Funnel outcome ingestion — Goal Engine reports what an angle did so the Brain
 * can learn what converts. Secret-guarded (machine-to-machine).
 *
 *   POST /api/retargeting/outcome
 *   header: x-brain-secret: <GOAL_ENGINE_ENROLL_SECRET>
 *   body:   { brand, angle, event, channel?, contactId?, goalId? }
 *           event = converted | booked | replied | clicked | no_response | unsubscribed
 */
export async function POST(req: Request) {
  if (!(await checkApiSecret(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    brand?: string;
    angle?: string;
    event?: string;
    channel?: string;
    contactId?: string;
    goalId?: string;
  };
  if (!body.brand || !body.angle || !body.event) {
    return NextResponse.json(
      { ok: false, error: "brand_angle_event_required" },
      { status: 400 },
    );
  }
  const result = await recordOutcome({
    brand: body.brand,
    angle: body.angle,
    event: body.event,
    channel: body.channel,
    contactId: body.contactId,
    goalId: body.goalId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
