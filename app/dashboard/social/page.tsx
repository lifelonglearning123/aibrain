import Link from "next/link";
import { Suspense } from "react";
import { ViewHeader } from "@/components/ViewHeader";
import { SocialComposer } from "@/components/SocialComposer";
import { SocialPerformance } from "@/components/SocialPerformance";
import { openaiConfig } from "@/lib/ai/openai";
import { configuredGhlEntities } from "@/lib/integrations/ghl";
import { higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { getBrandProfiles } from "@/lib/brand-profile";
import { resolveEntity, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = resolveEntity(entity);
  const access = await getAccess();
  const allowedBrands = access.brands;
  const initialEntity: EntityKey = allowedBrands.includes(filter as EntityKey)
    ? (filter as EntityKey)
    : allowedBrands[0];
  const { configured } = await openaiConfig();
  const ghlBrands = (await configuredGhlEntities()).filter((k) =>
    allowedBrands.includes(k),
  );
  const publishConfigured = ghlBrands.length > 0;
  const imageConfigured = (await higgsfieldConfig()).configured;
  // Brands the brain has Business Context for — these get automatic suggestions.
  const profiledBrands = Object.keys(await getBrandProfiles(allowedBrands)).filter(
    (k): k is EntityKey => allowedBrands.includes(k as EntityKey),
  );
  const contextComplete = profiledBrands.length === allowedBrands.length;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Social"
        subtitle="The brain suggests what to post from your business context — you approve, edit or discard"
        entity={entity}
      />

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${configured ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            Drafting {configured ? "ready (gpt-5.5)" : "needs OpenAI key"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${publishConfigured ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            Publishing{" "}
            {publishConfigured ? "via GoHighLevel" : "needs a GHL-connected brand"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${imageConfigured ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            Images {imageConfigured ? "ready (Higgsfield)" : "needs Higgsfield key"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${contextComplete ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            {contextComplete ? (
              "Business context: all brands"
            ) : (
              <>
                Business context: {profiledBrands.length}/{allowedBrands.length} brands —{" "}
                <Link href="/dashboard/context" className="underline hover:text-slate-900">
                  add the rest
                </Link>
              </>
            )}
          </span>
        </span>
      </div>

      {/* Streams in after the page paints — one live GHL read, fails to nothing. */}
      <Suspense fallback={null}>
        <SocialPerformance entity={initialEntity} />
      </Suspense>

      <SocialComposer
        configured={configured}
        ghlBrands={ghlBrands}
        imageConfigured={imageConfigured}
        initialEntity={initialEntity}
        allowedBrands={allowedBrands}
        profiledBrands={profiledBrands}
      />
    </div>
  );
}
