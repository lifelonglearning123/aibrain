import { ViewHeader } from "@/components/ViewHeader";
import { SocialComposer } from "@/components/SocialComposer";
import { openaiConfig } from "@/lib/ai/openai";
import { configuredGhlEntities } from "@/lib/integrations/ghl";
import { higgsfieldConfig } from "@/lib/integrations/higgsfield";
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

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Social"
        subtitle="Brand voice → AI-drafted, platform-tailored posts → publish"
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
      </div>

      <SocialComposer
        configured={configured}
        ghlBrands={ghlBrands}
        imageConfigured={imageConfigured}
        initialEntity={initialEntity}
        allowedBrands={allowedBrands}
      />
    </div>
  );
}
