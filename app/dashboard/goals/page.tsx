import Link from "next/link";
import { ViewHeader } from "@/components/ViewHeader";
import { listBrandGoals } from "@/lib/goal-engine/goals";
import { goalEngineDbConfigured } from "@/lib/goal-engine/db";
import { goalEngineConfig } from "@/lib/integrations/goal-engine";
import { resolveEntity, ENTITIES, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function GoalsPage({
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
  const ready = await goalEngineDbConfigured();
  const goals = ready ? await listBrandGoals(initialEntity) : [];
  const name = ENTITIES.find((e) => e.key === initialEntity)?.name ?? initialEntity;
  const qs = `?entity=${encodeURIComponent(entity ?? initialEntity)}`;
  const { url } = await goalEngineConfig();
  const newGoalUrl = url ? `${url.replace(/\/$/, "")}/admin/goals/new` : null;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Goals"
        subtitle="Your Goal Engine retargeting goals — view flows and live campaigns"
        entity={entity}
      />

      {!ready ? (
        <p className="text-sm text-slate-500">Goal Engine database not connected.</p>
      ) : goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          No goals for {name} yet.{" "}
          {newGoalUrl && (
            <a href={newGoalUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-600 underline">
              Create one in Goal Engine
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <Link
              key={g.id}
              href={`/dashboard/goals/${g.id}${qs}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {g.prompt || "(untitled goal)"}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {g.running > 0 && (
                    <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                      {g.running} running
                    </span>
                  )}
                  <span className="text-slate-400">
                    {g.totalCampaigns} campaign{g.totalCampaigns === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 font-medium ${
                      g.status === "active" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {g.status}
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
