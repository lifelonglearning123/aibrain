import { NextResponse } from "next/server";
import { submitImage, higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { directImage } from "@/lib/ai/image-director";
import { renderSocialCard } from "@/lib/social-card";
import { openaiConfig } from "@/lib/ai/openai";
import { getBrandProfile } from "@/lib/brand-profile";
import { ENTITIES, resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Submits the job and returns fast; the browser polls /api/social/image/status.
// (Branded graphic cards render inline and return a url immediately.)
export const maxDuration = 60;

export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    concept?: string;
    postText?: string;
    entity?: string;
    aspect?: string;
    format?: string;
  };
  const concept = (body.concept ?? body.prompt ?? "").trim();
  if (!concept) {
    return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 });
  }
  const aspect = body.aspect ?? "1:1";
  const requestedFormat = (body.format ?? "auto").toLowerCase();
  const entity = resolveEntity(body.entity);

  // Art-direct the treatment from the post + the brand's visual identity.
  let direction = null;
  if ((await openaiConfig()).configured && entity !== ALL) {
    const profile = await getBrandProfile(entity as EntityKey);
    const brand = ENTITIES.find((e) => e.key === entity);
    direction = await directImage({
      brandName: brand?.name ?? entity,
      oneLiner: profile?.oneLiner,
      icp: profile?.icp,
      visualStyle: profile?.visualStyle,
      accentColor: brand?.color,
      postText: (body.postText ?? "").trim() || undefined,
      concept,
      requestedFormat,
    }).catch(() => null);
  }

  // Branded graphic → rendered layout (crisp text), returns a url immediately.
  if (direction?.format === "graphic" || (!direction && requestedFormat === "graphic")) {
    if (entity === ALL) {
      return NextResponse.json({ ok: false, error: "brand_required" }, { status: 400 });
    }
    const card = direction?.card ?? { headline: concept.slice(0, 90) };
    const result = await renderSocialCard({ entity: entity as EntityKey, card, aspect });
    return NextResponse.json(
      { ...result, format: "graphic" },
      { status: result.ok ? 200 : 502 },
    );
  }

  // Photo / illustration → diffusion. Art-directed prompt when we have one
  // (Higgsfield's own enhancer off); raw concept as the fallback (enhancer on).
  if (!(await higgsfieldConfig()).configured) {
    return NextResponse.json({ ok: false, error: "higgsfield_not_configured" }, { status: 400 });
  }
  const result = await submitImage({
    prompt: direction?.prompt ?? concept,
    aspect,
    enhance: !direction?.prompt,
  });
  return NextResponse.json(
    {
      ...result,
      format: direction?.format ?? "photo",
      directed: Boolean(direction?.prompt),
    },
    { status: result.ok ? 200 : 502 },
  );
}
