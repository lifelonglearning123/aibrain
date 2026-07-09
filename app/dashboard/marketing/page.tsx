import { ViewHeader } from "@/components/ViewHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { ResearchPanel } from "@/components/ResearchPanel";
import { ENTITIES, resolveEntity } from "@/lib/entities";
import { configuredGhlEntities, getBrandMarketing } from "@/lib/integrations/ghl";
import { getAccess, scopeEntities } from "@/lib/access";
import { apifyConfig } from "@/lib/integrations/apify";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = resolveEntity(entity);
  const access = await getAccess();
  const allowedEntities = ENTITIES.filter((e) => access.brands.includes(e.key));
  const configured = (await configuredGhlEntities()).filter((k) =>
    access.brands.includes(k),
  );
  const apifyConfigured = (await apifyConfig()).configured;

  const scope = await scopeEntities(filter, configured, access);

  const rows = configured.length > 0 ? await Promise.all(scope.map(getBrandMarketing)) : [];
  const ok = rows.filter((r) => !r.error);
  const totLeads30 = ok.reduce((s, r) => s + r.new30d, 0);
  const totLeads7 = ok.reduce((s, r) => s + r.new7d, 0);
  const totLeads = ok.reduce((s, r) => s + r.totalLeads, 0);

  // Combined top source across shown brands
  const combined = new Map<string, number>();
  for (const r of ok) for (const b of r.bySource) combined.set(b.source, (combined.get(b.source) ?? 0) + b.count);
  const topSource = [...combined.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const notConnected = allowedEntities.filter((e) => !configured.includes(e.key));
  const singleBrand = scope.length === 1 ? ok[0] : null;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Marketing"
        subtitle="Lead volume &amp; source across GoHighLevel · Apify research"
        entity={entity}
      />

      {configured.length === 0 ? (
        <EmptyState source="GoHighLevel" phase="Marketing">
          Lead-source analytics come from your GHL contacts — add a token +
          location per brand (as for Pipeline) to see them.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Leads (30d)" value={String(totLeads30)} hint="New contacts" accent="#2563eb" />
            <StatCard label="New this week" value={String(totLeads7)} hint="Last 7 days" accent="#10b981" />
            <StatCard label="Top channel" value={topSource} hint="By lead volume" accent="#f59e0b" />
            <StatCard label="Total leads" value={String(totLeads)} hint="All contacts" accent="#8b5cf6" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Brand</th>
                  <th className="px-4 py-2.5 font-medium">Leads (30d)</th>
                  <th className="px-4 py-2.5 font-medium">New (7d)</th>
                  <th className="px-4 py-2.5 font-medium">Top source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.entityKey} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    {r.error ? (
                      <td colSpan={3} className="px-4 py-2.5 text-red-600">
                        {r.error === "not_configured" ? "Not connected" : `Error: ${r.error}`}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.new30d}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.new7d}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r.topSource ?? "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {singleBrand && singleBrand.bySource.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Leads by source — {singleBrand.name}
              </h3>
              <div className="space-y-2">
                {singleBrand.bySource.slice(0, 8).map((s) => {
                  const max = singleBrand.bySource[0]?.count || 1;
                  return (
                    <div key={s.source} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 truncate text-sm text-slate-600">{s.source}</div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-400"
                          style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }}
                        />
                      </div>
                      <div className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-600">
                        {s.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notConnected.length > 0 && (
            <p className="text-xs text-slate-400">
              Not connected: {notConnected.map((e) => e.name).join(", ")}.
            </p>
          )}

          <p className="text-xs text-slate-400">
            Note: reads up to 1,000 recent contacts per brand. Cost-per-lead / ROAS
            needs ad-spend data (Facebook/Google Ads) — a later add.
          </p>
        </>
      )}

      <ResearchPanel apifyConfigured={apifyConfigured} />
    </div>
  );
}
