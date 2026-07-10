import { NextResponse } from "next/server";
import { draftPosts } from "@/lib/ai/draft";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { getPreferenceGuidance } from "@/lib/preferences";
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
  const brandVoice = (body.brandVoice ?? "").trim();
  const platforms = Array.isArray(body.platforms) ? body.platforms : [];

  if (!topic || !brandVoice || platforms.length === 0) {
    return NextResponse.json(
      { ok: false, error: "topic, brandVoice and platforms are required" },
      { status: 400 },
    );
  }

  const entity = resolveEntity(body.entity);
  if (access && entity !== ALL && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  try {
    // Inject what the brain has learned for this brand. Shared cross-brand
    // portfolio insights are only mixed in for owners.
    const includeShared = access ? access.isOwner : true;
    const knowledge = await getBrandKnowledge(entity === ALL ? "" : entity, { includeShared });
    const insights = knowledgePrompt(knowledge);
    // Inject learned style preferences (from what you approve/edit/reject).
    const preferences = entity === ALL ? "" : await getPreferenceGuidance(entity, "social");

    const posts = await draftPosts({ brandVoice, topic, platforms, insights, preferences });
    return NextResponse.json({
      ok: true,
      posts,
      usedInsights: insights.length > 0,
      usedPreferences: preferences.length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "draft_failed" },
      { status: 500 },
    );
  }
}
