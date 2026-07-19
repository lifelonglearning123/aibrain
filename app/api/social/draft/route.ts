import { NextResponse } from "next/server";
import { draftPosts } from "@/lib/ai/draft";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { getBrandProfile, profilePrompt, voiceBlock, brandName } from "@/lib/brand-profile";
import { getPostPerformance, performancePrompt } from "@/lib/social-performance";
import { getPreferenceGuidance } from "@/lib/preferences";
import { VOICE_BENEFITS } from "@/lib/ai/voice-benefits";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export async function POST(req: Request) {
  // Auth + per-brand access guard when Supabase is set up.
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await openaiConfig()).configured) {
    return NextResponse.json(
      { ok: false, error: "openai_not_configured" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    platforms?: string[];
    brandVoice?: string;
    entity?: string;
  };
  const topic = (body.topic ?? "").trim();
  let brandVoice = (body.brandVoice ?? "").trim();
  const platforms = Array.isArray(body.platforms) ? body.platforms : [];

  if (!topic || platforms.length === 0) {
    return NextResponse.json(
      { ok: false, error: "topic and platforms are required" },
      { status: 400 },
    );
  }

  const entity = resolveEntity(body.entity);
  if (access && entity !== ALL && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  // No manual voice given → the brain supplies it from the brand's Business
  // Context profile (offer, ICP, tone, the owner's real writing samples).
  let usedProfile = false;
  if (!brandVoice) {
    if (entity === ALL) {
      return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
    }
    const profile = await getBrandProfile(entity as EntityKey);
    brandVoice = [profilePrompt(profile, brandName(entity as EntityKey)), voiceBlock(profile)]
      .filter(Boolean)
      .join("\n\n");
    usedProfile = brandVoice.length > 0;
    if (!brandVoice) {
      return NextResponse.json({ ok: false, error: "no_brand_context" }, { status: 400 });
    }
  }

  try {
    // Inject what the brain has learned for this brand. Shared cross-brand
    // portfolio insights are only mixed in for owners.
    const includeShared = access ? access.isOwner : true;
    const [knowledge, preferences, perf] = await Promise.all([
      getBrandKnowledge(entity === ALL ? "" : entity, { includeShared }),
      // Learned style preferences (from what you approve/edit/reject).
      entity === ALL ? Promise.resolve("") : getPreferenceGuidance(entity, "social"),
      // Real engagement on published posts (live from GHL).
      entity === ALL
        ? Promise.resolve({ posts: [], top: [], flops: [] })
        : getPostPerformance(entity as EntityKey),
    ]);
    const insights = knowledgePrompt(knowledge);

    const posts = await draftPosts({
      brandVoice,
      topic,
      platforms,
      insights,
      preferences,
      performance: performancePrompt(perf),
      benefits: VOICE_BENEFITS,
    });
    return NextResponse.json({
      ok: true,
      posts,
      usedInsights: insights.length > 0,
      usedPreferences: preferences.length > 0,
      usedProfile,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "draft_failed" },
      { status: 500 },
    );
  }
}
