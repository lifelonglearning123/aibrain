import { NextResponse } from "next/server";
import { draftSequence } from "@/lib/ai/sequence";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { getPreferenceGuidance } from "@/lib/preferences";
import { getBrandProfile, profilePrompt, voiceBlock } from "@/lib/brand-profile";
import { resolveEntity, ALL, ENTITIES, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const maxDuration = 60;

/** Drafts a retargeting sequence from a brand's learned insights (draft-for-approval). */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await openaiConfig()).configured) {
    return NextResponse.json({ ok: false, error: "openai_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { entity?: string; goal?: string };
  const entity = resolveEntity(body.entity);
  const goal = (body.goal ?? "").trim();
  if (!goal) return NextResponse.json({ ok: false, error: "goal_required" }, { status: 400 });

  if (access && entity !== ALL && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  const brandName =
    entity === ALL ? undefined : ENTITIES.find((e) => e.key === (entity as EntityKey))?.name;
  const includeShared = access ? access.isOwner : true;
  const profile = entity === ALL ? null : await getBrandProfile(entity as EntityKey);
  const knowledge = [
    profilePrompt(profile, brandName),
    knowledgePrompt(await getBrandKnowledge(entity === ALL ? "" : entity, { includeShared })),
  ]
    .filter(Boolean)
    .join("\n\n");
  const preferences = [
    entity === ALL ? "" : await getPreferenceGuidance(entity, "sequence"),
    voiceBlock(profile),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const steps = await draftSequence({ brandName, goal, knowledge, preferences });
    return NextResponse.json({
      ok: true,
      steps,
      usedInsights: knowledge.length > 0,
      usedPreferences: preferences.length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "draft_failed" },
      { status: 500 },
    );
  }
}
