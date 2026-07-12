import { redirect } from "next/navigation";
import { getIntegrations } from "@/lib/integrations/registry";
import { quickbooksConfig } from "@/lib/integrations/quickbooks";
import { xeroConfig } from "@/lib/integrations/xero";
import { gmailConfig, gmailConnected } from "@/lib/integrations/gmail";
import { LoomSyncButton } from "@/components/LoomSyncButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ConnectedAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ quickbooks?: string; xero?: string; gmail?: string }>;
}) {
  // Owner-only: connection status spans every company.
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.isOwner) redirect("/dashboard");
  }

  const { quickbooks, xero, gmail } = await searchParams;
  const integrations = await getIntegrations();
  const engines = integrations.filter((i) => i.internal);
  const tools = integrations.filter((i) => !i.internal);
  const [qb, xeroCfg, gmailCfg, gmailReady] = await Promise.all([
    quickbooksConfig(),
    xeroConfig(),
    gmailConfig(),
    gmailConnected(),
  ]);

  // How many Loom recaps have been ingested so far.
  let loomCount = 0;
  const admin = createAdminClient();
  if (admin && gmailReady) {
    const { count } = await admin
      .from("knowledge_documents")
      .select("id", { count: "exact", head: true })
      .eq("source", "loom");
    loomCount = count ?? 0;
  }

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

      {xero && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            xero === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {xero === "connected"
            ? "Xero organisation connected."
            : `Xero connection failed (${xero}).`}
        </div>
      )}

      {gmail && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            gmail === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {gmail === "connected"
            ? "Gmail connected — Loom recaps will sync."
            : gmail === "no_refresh_token"
              ? "Gmail connect didn't return a refresh token — remove the app's access at myaccount.google.com/permissions and reconnect."
              : `Gmail connection failed (${gmail}).`}
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

      {xeroCfg.configured && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Connect Xero organisations
          </h2>
          <div className="flex flex-wrap gap-2">
            {ENTITIES.map((e) => (
              <a
                key={e.key}
                href={`/api/integrations/xero/connect?entity=${e.key}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Connect {e.name}
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            A brand connected to both uses Xero. Connect each brand to just one.
          </p>
        </div>
      )}

      {gmailCfg.configured && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Loom knowledge (via Gmail)
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">
                Gmail {gmailReady ? "connected" : "not connected"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  gmailReady ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {gmailReady ? `${loomCount} recaps ingested` : "Not connected"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Reads Loom&apos;s recap emails (summary + notes of every recording) into the
              brain. Read-only, and only Loom emails are used.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!gmailReady ? (
                <a
                  href="/api/integrations/gmail/connect"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Connect Gmail
                </a>
              ) : (
                <>
                  <LoomSyncButton />
                  <a
                    href="/api/integrations/gmail/connect"
                    className="text-xs font-medium text-slate-400 hover:text-slate-700"
                  >
                    Reconnect
                  </a>
                </>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            New recaps also sync automatically each week. Use &ldquo;Sync now&rdquo; repeatedly to
            backfill your history.
          </p>
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
