import { ViewHeader } from "@/components/ViewHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { ENTITIES, resolveEntity } from "@/lib/entities";
import { configuredGhlEntities, getBrandPipeline } from "@/lib/integrations/ghl";
import { getAccess, scopeEntities } from "@/lib/access";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export default async function PipelinePage({
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

  if (configured.length === 0) {
    return (
      <div className="space-y-6">
        <ViewHeader
          title="Pipeline"
          subtitle="Leads &amp; opportunities across all GoHighLevel accounts"
          entity={entity}
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="New deals (7d)" value="—" hint="Connect GHL" accent="#2563eb" />
          <StatCard label="Open deals" value="—" hint="Connect GHL" accent="#10b981" />
          <StatCard label="Pipeline value" value="—" hint="Connect GHL" accent="#f59e0b" />
          <StatCard label="Win rate" value="—" hint="Connect GHL" accent="#8b5cf6" />
        </div>
        <EmptyState source="GoHighLevel" phase="Phase 2">
          Add a Private Integration Token + location per brand
          (<code>GHL_TOKEN__MACAWS</code>, <code>GHL_LOCATION__MACAWS</code> …) and
          this shows a unified pipeline across all three agencies.
        </EmptyState>
      </div>
    );
  }

  const scope = await scopeEntities(filter, configured, access);

  const results = await Promise.all(scope.map(getBrandPipeline));
  const ok = results.filter((r) => !r.error);
  const currency = ok.find((r) => r.currency)?.currency ?? "GBP";

  const totNew = ok.reduce((s, r) => s + r.new7d, 0);
  const totOpen = ok.reduce((s, r) => s + r.openCount, 0);
  const totValue = ok.reduce((s, r) => s + r.openValueCents, 0);
  const totWon = ok.reduce((s, r) => s + r.wonCount, 0);
  const totLost = ok.reduce((s, r) => s + r.lostCount, 0);
  const winRate = totWon + totLost > 0 ? totWon / (totWon + totLost) : null;

  const notConnected = allowedEntities.filter((e) => !configured.includes(e.key));
  const singleBrand = scope.length === 1 ? ok[0] : null;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Pipeline"
        subtitle="Live from GoHighLevel — unified across your agencies"
        entity={entity}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="New deals (7d)" value={String(totNew)} hint="Created last 7 days" accent="#2563eb" />
        <StatCard label="Open deals" value={String(totOpen)} hint="Status = open" accent="#10b981" />
        <StatCard label="Pipeline value" value={formatMoney(totValue, currency)} hint="Open deals" accent="#f59e0b" />
        <StatCard label="Win rate" value={pct(winRate)} hint="Won / (won+lost)" accent="#8b5cf6" />
      </div>

      {/* Per-brand breakdown */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-medium">Brand</th>
              <th className="px-4 py-2.5 font-medium">New (7d)</th>
              <th className="px-4 py-2.5 font-medium">Open</th>
              <th className="px-4 py-2.5 font-medium">Pipeline value</th>
              <th className="px-4 py-2.5 font-medium">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.entityKey} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                {r.error ? (
                  <td colSpan={4} className="px-4 py-2.5 text-red-600">
                    {r.error === "not_configured" ? "Not connected" : `Error: ${r.error}`}
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.new7d}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{r.openCount}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{formatMoney(r.openValueCents, r.currency)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">{pct(r.winRate)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stage breakdown for a single selected brand */}
      {singleBrand && singleBrand.stages.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Open deals by stage — {singleBrand.name}
          </h3>
          <div className="space-y-2">
            {singleBrand.stages.map((s) => {
              const max = singleBrand.stages[0]?.count || 1;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-sm text-slate-600">{s.name}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-400"
                      style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-600">
                    {s.count} · {formatMoney(s.valueCents, singleBrand.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {notConnected.length > 0 && (
        <p className="text-xs text-slate-400">
          Not connected: {notConnected.map((e) => e.name).join(", ")} — add a GHL
          token + location to include them.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Note: reads up to 1,000 recent opportunities per brand. Currency defaults
        to GBP (set <code>GHL_CURRENCY__&lt;BRAND&gt;</code> to override).
      </p>
    </div>
  );
}
