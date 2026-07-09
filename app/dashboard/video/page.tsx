import { ViewHeader } from "@/components/ViewHeader";
import { VideoComposer } from "@/components/VideoComposer";
import { higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { shotstackConfig } from "@/lib/integrations/shotstack";
import { configuredGhlEntities } from "@/lib/integrations/ghl";
import { resolveEntity, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function VideoPage({
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
  const aiConfigured = (await higgsfieldConfig()).configured;
  const renderConfigured = (await shotstackConfig()).configured;
  const ghlBrands = (await configuredGhlEntities()).filter((k) =>
    allowedBrands.includes(k),
  );

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Video"
        subtitle="Mix your own clips with AI-generated clips → assemble → publish"
        entity={entity}
      />

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            AI clips {aiConfigured ? "ready (Higgsfield)" : "need Higgsfield key"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${renderConfigured ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          <span className="font-medium text-slate-700">
            Assembly {renderConfigured ? "ready (Shotstack)" : "needs Shotstack key"}
          </span>
        </span>
        <span className="text-slate-400">· Your own clips work without a key</span>
      </div>

      <VideoComposer
        aiConfigured={aiConfigured}
        renderConfigured={renderConfigured}
        ghlBrands={ghlBrands}
        initialEntity={initialEntity}
        allowedBrands={allowedBrands}
      />
    </div>
  );
}
