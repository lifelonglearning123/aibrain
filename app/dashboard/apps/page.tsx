import { redirect } from "next/navigation";
import { getIntegrations } from "@/lib/integrations/registry";
import { quickbooksConfig } from "@/lib/integrations/quickbooks";
import { ENTITIES } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ConnectedAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string }>;
}) {
  // Owner-only: connection status spans every company.
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.isOwner) redirect("/dashboard");
  }

  const { quickbooks } = await searchParams;
  const integrations = await getIntegrations();
  const engines = integrations.filter((i) => i.internal);
  const tools = integrations.filter((i) => !i.internal);
  const qb = await quickbooksConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Connected apps</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          One place to see and fire everything — your own engines and the tools
          they read from.
        </p>
      </div>

      {quickbooks && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            quickbooks === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {quickbooks === "connected"
            ? "QuickBooks company connected."
            : `QuickBooks connection failed (${quickbooks}).`}
        </div>
      )}

      <Section title="Your engines" items={engines} />
      <Section title="Tools &amp; data sources" items={tools} />

      {qb.configured && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Connect QuickBooks companies
          </h2>
          <div className="flex flex-wrap gap-2">
            {ENTITIES.map((e) => (
              <a
                key={e.key}
                href={`/api/integrations/quickbooks/connect?entity=${e.key}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Connect {e.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Awaited<ReturnType<typeof getIntegrations>>;
}) {
  return (
    <div>
      <h2
        className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div
            key={i.key}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">
                {i.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  i.configured
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {i.configured ? "Connected" : "Not connected"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{i.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
