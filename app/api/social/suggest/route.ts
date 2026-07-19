import { NextResponse } from "next/server";
import { suggestPosts } from "@/lib/ai/suggest";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandKnowledge, knowledgePrompt } from "@/lib/knowledge";
import { getPostPerformance, performancePrompt } from "@/lib/social-performance";
import { getBrandProfile, profilePrompt, voiceBlock, brandName } from "@/lib/brand-profile";
import { VOICE_BENEFITS } from "@/lib/ai/voice-benefits";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/access";

/**
 * The brain suggests what to post next for a brand, from its Business Context
 * profile + learned customer evidence. The user approves/edits — never starts
 * from a blank page.
 */

/** Recently approved/edited posts, so suggestions don't repeat them. */
async function recentPostTopics(entity: string): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("content_feedback")
    .select("final")
    .eq("entity_key", entity)
    .eq("kind", "social")
    .in("action", ["approve", "edit"])
    .order("created_at", { ascending: false })
    .limit(10);
  const seen = new Set<string>();
  return ((data as { final: string | null }[]) ?? [])
    .map((r) => (r.final ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
    .filter((t) => t && !seen.has(t) && (seen.add(t), true))
    .slice(0, 8);
}

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

  const body = (await req.json().catch(() => ({}))) as { entity?: string };
  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
  }
  if (access && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }

  try {
    const includeShared = access ? access.isOwner : true;
    const [profile, knowledge, feedbackRecent, perf] = await Promise.all([
      getBrandProfile(entity as EntityKey),
      getBrandKnowledge(entity, { includeShared }),
      recentPostTopics(entity),
      getPostPerformance(entity as EntityKey),
    ]);
    const context = profilePrompt(profile, brandName(entity as EntityKey));
    const insights = knowledgePrompt(knowledge);

    // Nothing to ground suggestions in yet — send the user to Business Context.
    if (!context && !insights) {
      return NextResponse.json({ ok: false, error: "no_context" }, { status: 400 });
    }

    // "Don't repeat" list: real published posts from GHL when available (the
    // same message on several platforms counts once), else composer feedback.
    const seen = new Set<string>();
    const recent = perf.posts.length
      ? perf.posts
          .map((p) => p.text.replace(/\s+/g, " ").trim().slice(0, 160))
          .filter((t) => t && !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true))
          .slice(0, 8)
      : feedbackRecent;

    const suggestions = await suggestPosts({
      brandName: brandName(entity as EntityKey),
      context,
      voice: voiceBlock(profile),
      insights,
      performance: performancePrompt(perf),
      benefits: VOICE_BENEFITS,
      recentPosts: recent,
    });
    return NextResponse.json({
      ok: true,
      suggestions,
      hasProfile: context.length > 0,
      usedPerformance: perf.top.length + perf.flops.length > 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "suggest_failed" },
      { status: 500 },
    );
  }
}
