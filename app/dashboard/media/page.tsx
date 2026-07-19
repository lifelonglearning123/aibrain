import { ViewHeader } from "@/components/ViewHeader";
import { MediaManager } from "@/components/MediaManager";
import { resolveEntity, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function MediaPage({
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

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Media"
        subtitle="Upload the videos you've recorded — then use them in Social posts and Video edits"
        entity={entity}
      />
      <MediaManager initialEntity={initialEntity} allowedBrands={allowedBrands} />
    </div>
  );
}
