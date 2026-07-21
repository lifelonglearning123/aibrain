import { NextResponse } from "next/server";
import { checkApiSecret } from "@/lib/brain-api-auth";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { getPreferenceGuidance } from "@/lib/preferences";
import { getTaughtFacts } from "@/lib/ai/brain-facts";
import { getBrandProfile, profilePrompt, voiceBlock } from "@/lib/brand-profile";
import { VOICE_BENEFITS, VALUE_LED_GUIDANCE } from "@/lib/ai/voice-benefits";
import { resolveEntity, ALL, ENTITIES, type EntityKey } from "@/lib/entities";

export const dynamic = "force-dynamic";

/**
 * Knowledge Provider API — the Brain hands its learned knowledge to Goal Engine
 * (or any trusted consumer) so its retargeting is grounded in what actually wins
 * deals. Secret-guarded (machine-to-machine). Read-only.
 *
 *   GET /api/knowledge/<brand>   header: x-brain-secret: <GOAL_ENGINE_ENROLL_SECRET>
 */
export async function GET(req: Request, ctx: { params: Promise<{ brand: string }> }) {
  if (!(await checkApiSecret(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { brand } = await ctx.params;
  const entity = resolveEntity(brand);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "unknown_brand" }, { status: 404 });
  }
  const key = entity as EntityKey;
  const name = ENTITIES.find((e) => e.key === key)?.name ?? key;

  const [k, prefs, facts, profile] = await Promise.all([
    getBrandKnowledge(key, { includeShared: true }),
    getPreferenceGuidance(key, "sequence"),
    getTaughtFacts([key], true),
    getBrandProfile(key),
  ]);

  // Business context first (what the business is), then winning angles, voice +
  // rules, the verified benefit facts, and the value-led writing steer — so
  // Goal Engine's own flows are grounded AND value-led (not salesy).
  const promptBlock = [
    profilePrompt(profile, name),
    knowledgePrompt(k),
    voiceBlock(profile),
    facts.length ? `Rules to always follow: ${facts.map((f) => f.text).join(" | ")}` : "",
    prefs ? `Preferred writing style: ${prefs}` : "",
    VOICE_BENEFITS,
    VALUE_LED_GUIDANCE,
  ]
    .filter(Boolean)
    .join("\n\n");

  return NextResponse.json({
    ok: true,
    brand: key,
    name,
    winningAngles: k.winningPhrases,
    objections: k.objections,
    painPoints: k.painPoints,
    faqs: k.faqs,
    taughtFacts: facts.map((f) => f.text),
    stylePreferences: prefs || null,
    // The verified benefit facts + value-led steer, also exposed structured.
    verifiedBenefits: VOICE_BENEFITS,
    writingGuidance: VALUE_LED_GUIDANCE,
    // A ready-to-use context block Goal Engine can drop into its planner prompt.
    promptBlock,
    generatedAt: new Date().toISOString(),
  });
}
