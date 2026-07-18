import { NextResponse } from "next/server";
import { submitVideo, higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { directVideo } from "@/lib/ai/video-director";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandProfile } from "@/lib/brand-profile";
import { ENTITIES, resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Generates an image from the prompt, then animates it — allow extra time.
export const maxDuration = 300;

/** Submit an AI video clip generation; returns a job id to poll (or an immediate url). */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await higgsfieldConfig()).configured) {
    return NextResponse.json({ ok: false, error: "higgsfield_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    concept?: string;
    postText?: string;
    entity?: string;
    aspect?: string;
    // A still from an earlier beat, so this clip continues the same series.
    refImageUrl?: string;
  };
  const concept = (body.concept ?? body.prompt ?? "").trim();
  if (!concept) {
    return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 });
  }
  const aspect = body.aspect ?? "9:16";
  const entity = resolveEntity(body.entity);

  // Give the clip a brain: art-direct the still + motion from the brand's
  // visual identity and the post it accompanies. Falls back to the raw concept
  // when OpenAI isn't set or no specific brand is chosen (no regression).
  let direction = null;
  if ((await openaiConfig()).configured && entity !== ALL) {
    const profile = await getBrandProfile(entity as EntityKey);
    const brand = ENTITIES.find((e) => e.key === entity);
    direction = await directVideo({
      brandName: brand?.name ?? entity,
      oneLiner: profile?.oneLiner,
      icp: profile?.icp,
      visualStyle: profile?.visualStyle,
      accentColor: brand?.color,
      postText: (body.postText ?? "").trim() || undefined,
      concept,
    }).catch(() => null);
  }

  const result = await submitVideo({
    prompt: concept,
    aspect,
    stillPrompt: direction?.stillPrompt,
    motionPrompt: direction?.motionPrompt,
    refImageUrl: body.refImageUrl,
  });
  return NextResponse.json(
    { ...result, directed: Boolean(direction) },
    { status: result.ok ? 200 : 502 },
  );
}
