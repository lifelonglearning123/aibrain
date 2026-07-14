import { ViewHeader } from "@/components/ViewHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { ENTITIES, resolveEntity } from "@/lib/entities";
import {
  configuredStripeEntities,
  getBrandRevenue,
  getBrandRevenueMix,
} from "@/lib/integrations/stripe";
import { accountingConfig, getBrandFinancials } from "@/lib/integrations/accounting";
import { getAccess, scopeEntities } from "@/lib/access";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

function cell(v: string) {
  return <td className="px-4 py-2.5 tabular-nums text-slate-700">{v}</td>;
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = resolveEntity(entity);
  const access = await getAccess();
  const allowedEntities = ENTITIES.filter((e) => access.brands.includes(e.key));
  const stripeSet = new Set(
    (await configuredStripeEntities()).filter((k) => access.brands.includes(k)),
  );
  const acct = await accountingConfig();

  // No revenue source at all → connect state.
  if (stripeSet.size === 0 && !acct.anyConfigured) {
    return (
      <div className="space-y-6">
        <ViewHeader
          title="Revenue"
          subtitle="Stripe &amp; accounting (QuickBooks / Xero) — MRR, expenses, net"
          entity={entity}
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="MRR" value="—" hint="Connect Stripe" accent="#2563eb" />
          <StatCard label="Revenue (30d)" value="—" hint="Connect Stripe" accent="#10b981" />
          <StatCard label="Expenses (30d)" value="—" hint="Connect accounting" accent="#ef4444" />
          <StatCard label="Net (30d)" value="—" hint="From accounting" accent="#f59e0b" />
        </div>
        <EmptyState source="Stripe &amp; accounting" phase="Phase 1">
          Add a Stripe key per brand for revenue/MRR, and connect an accounting
          tool per brand for expenses and net — <strong>QuickBooks</strong> or{" "}
          <strong>Xero</strong>. Connect them from <strong>Connected apps</strong>.
        </EmptyState>
      </div>
    );
  }

  const scope = await scopeEntities(filter, allowedEntities.map((e) => e.key), access);

  const rows = await Promise.all(
    scope.map(async (key) => {
      const name = ENTITIES.find((e) => e.key === key)!.name;
      const [stripe, mix] = stripeSet.has(key)
        ? await Promise.all([getBrandRevenue(key), getBrandRevenueMix(key, 30)])
        : [null, null];
      const financials = acct.anyConfigured ? await getBrandFinancials(key) : null;
      const qbData = financials && !financials.error ? financials : null;
      return { key, name, stripe, mix, qbData, hasStripeKey: stripeSet.has(key) };
    }),
  );

  const shown = rows.filter((r) => r.hasStripeKey || r.qbData);
  const currency =
    shown.find((r) => r.stripe && !r.stripe.error)?.stripe?.currency ??
    shown.find((r) => r.qbData)?.qbData?.currency ??
    "GBP";

  const totalMrr = shown.reduce(
    (s, r) => s + (r.stripe && !r.stripe.error ? r.stripe.mrrCents : 0),
    0,
  );
  const totalPaying = shown.reduce(
    (s, r) => s + (r.stripe && !r.stripe.error ? r.stripe.payingSubs : 0),
    0,
  );
  const totalRev = shown.reduce(
    (s, r) => s + (r.stripe && !r.stripe.error ? r.stripe.revenue30dCents : 0),
    0,
  );
  const totalExp = shown.reduce((s, r) => s + (r.qbData ? r.qbData.expensesCents : 0), 0);
  const totalNet = shown.reduce((s, r) => s + (r.qbData ? r.qbData.netCents : 0), 0);

  // Revenue mix (30d): recurring subscriptions vs manual invoices vs ad-hoc.
  const okMix = shown.map((r) => r.mix).filter((m): m is NonNullable<typeof m> => !!m && !m.error);
  const mixRecurring = okMix.reduce((s, m) => s + m.recurringCents, 0);
  const mixInvoice = okMix.reduce((s, m) => s + m.invoiceCents, 0);
  const mixOther = okMix.reduce((s, m) => s + m.otherCents, 0);
  const mixTotal = mixRecurring + mixInvoice + mixOther;
  const mixPct = (c: number) => (mixTotal > 0 ? Math.round((c / mixTotal) * 100) : 0);
  const mixItems = okMix
    .flatMap((m) => m.items)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 6);

  const notConnected = allowedEntities.filter(
    (e) => !rows.find((r) => r.key === e.key && (r.hasStripeKey || r.qbData)),
  );

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Revenue"
        subtitle="Live — Stripe (MRR/revenue) + accounting (expenses/net) per brand"
        entity={entity}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="MRR" value={formatMoney(totalMrr, currency)} hint={`Net of discounts · ${totalPaying} paying subs`} accent="#2563eb" />
        <StatCard label="Revenue (30d)" value={formatMoney(totalRev, currency)} hint="Stripe · succeeded charges" accent="#10b981" />
        <StatCard label="Expenses (12mo)" value={acct.anyConfigured ? formatMoney(totalExp, currency) : "—"} hint={acct.anyConfigured ? "Accounting P&L · 12 months" : "Connect accounting"} accent="#ef4444" />
        <StatCard label="Net (12mo)" value={acct.anyConfigured ? formatMoney(totalNet, currency) : "—"} hint={acct.anyConfigured ? "Accounting P&L · 12 months" : "From accounting"} accent="#f59e0b" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 font-medium">Brand</th>
              <th className="px-4 py-2.5 font-medium">MRR</th>
              <th className="px-4 py-2.5 font-medium">Revenue (30d)</th>
              <th className="px-4 py-2.5 font-medium">Expenses (12mo)</th>
              <th className="px-4 py-2.5 font-medium">Net (12mo)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                {r.stripe && !r.stripe.error
                  ? [
                      cell(formatMoney(r.stripe.mrrCents, r.stripe.currency)),
                      cell(formatMoney(r.stripe.revenue30dCents, r.stripe.currency)),
                    ]
                  : [cell(r.stripe?.error ? "err" : "—"), cell(r.stripe?.error ? "err" : "—")]}
                {r.qbData
                  ? [
                      cell(formatMoney(r.qbData.expensesCents, r.qbData.currency)),
                      cell(formatMoney(r.qbData.netCents, r.qbData.currency)),
                    ]
                  : [cell("—"), cell("—")]}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mixTotal > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Revenue mix — last 30 days
            </h2>
            <span className="text-xs text-slate-400">
              {formatMoney(mixTotal, currency)} collected
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <p className="text-xs font-medium text-emerald-700">Recurring subscriptions</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatMoney(mixRecurring, currency)}{" "}
                <span className="text-xs font-normal text-slate-400">{mixPct(mixRecurring)}%</span>
              </p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-amber-700">Manual / GHL invoices</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatMoney(mixInvoice, currency)}{" "}
                <span className="text-xs font-normal text-slate-400">{mixPct(mixInvoice)}%</span>
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Other one-off</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatMoney(mixOther, currency)}{" "}
                <span className="text-xs font-normal text-slate-400">{mixPct(mixOther)}%</span>
              </p>
            </div>
          </div>
          {mixItems.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
              {mixItems.map((i, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <span className="truncate">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        i.kind === "subscription"
                          ? "bg-emerald-100 text-emerald-700"
                          : i.kind === "invoice"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {i.kind === "subscription" ? "recurring" : i.kind === "invoice" ? "invoice" : "one-off"}
                    </span>
                    {i.label}
                  </span>
                  <span className="tabular-nums text-slate-700">{formatMoney(i.cents, currency)}</span>
                </li>
              ))}
            </ul>
          )}
          {mixInvoice > 0 && (
            <p className="mt-3 text-xs text-amber-600">
              Amber = paid via manual/GHL invoices. Monthly services billed this way are recurring
              revenue that isn&apos;t counted in MRR — worth converting to real subscriptions.
            </p>
          )}
        </div>
      )}

      {notConnected.length > 0 && (
        <p className="text-xs text-slate-400">
          Not connected: {notConnected.map((e) => e.name).join(", ")} — add a
          Stripe key and/or connect an accounting tool (QuickBooks or Xero).
        </p>
      )}

      <p className="text-xs text-slate-400">
        Revenue = gross succeeded Stripe charges (minus refunds, last 30 days).
        Expenses &amp; Net = your accounting Profit &amp; Loss (QuickBooks or Xero)
        for the last 12 months — accounting data lags, so a longer window keeps it meaningful.
      </p>
    </div>
  );
}
