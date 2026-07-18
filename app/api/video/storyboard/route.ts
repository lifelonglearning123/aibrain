import { NextResponse } from "next/server";
import { generateStoryboard } from "@/lib/ai/storyboard";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandProfile, profilePrompt, voiceBlock, brandName } from "@/lib/brand-profile";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** The brain writes a multi-beat voiceover script for a brand's video. */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!(await openaiConfig()).configured) {
    return NextResponse.json({ ok: false, error: "openai_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    entity?: string;
    topic?: string;
    targetSeconds?: number;
  };
  const topic = (body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "topic_required" }, { status: 400 });
  }
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
  }
  if (access && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  try {
    const includeShared = access ? access.isOwner : true;
    const [profile, knowledge] = await Promise.all([
      getBrandProfile(entity as EntityKey),
      getBrandKnowledge(entity, { includeShared }),
    ]);
    const storyboard = await generateStoryboard({
      brandName: brandName(entity as EntityKey),
      topic,
      context: profilePrompt(profile, brandName(entity as EntityKey)),
      voice: voiceBlock(profile),
      insights: knowledgePrompt(knowledge),
      targetSeconds: Math.min(60, Math.max(12, Number(body.targetSeconds) || 24)),
    });
    if (!storyboard) {
      return NextResponse.json({ ok: false, error: "no_storyboard" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...storyboard });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "storyboard_failed" },
      { status: 500 },
    );
  }
}
