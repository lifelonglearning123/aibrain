import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoalDetail, entityForGhlLocation } from "@/lib/goal-engine/goals";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const CHANNEL_COLOR: Record<string, string> = {
  sms: "bg-sky-100 text-sky-700",
  email: "bg-violet-100 text-violet-700",
  whatsapp: "bg-emerald-100 text-emerald-700",
  voice: "bg-amber-100 text-amber-700",
  voicemail: "bg-amber-100 text-amber-700",
};

function waitLabel(hours: number): string {
  if (!hours) return "immediately";
  if (hours < 24) return `after ${hours}h`;
  const d = Math.round(hours / 24);
  return `after ${d} day${d === 1 ? "" : "s"}`;
}

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ goalId: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { goalId } = await params;
  const { entity } = await searchParams;
  const access = await getAccess();
  const detail = await getGoalDetail(goalId);
  if (!detail) notFound();

  const brand = await entityForGhlLocation(detail.ghlLocationId, access.brands);
  if (!brand) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        You don&apos;t have access to this goal.
      </div>
    );
  }

  const backQs = `?entity=${encodeURIComponent(entity ?? brand)}`;
  const running = detail.campaigns.filter((c) => c.status === "running").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/goals${backQs}`} className="text-xs font-medium text-slate-500 hover:text-slate-900">
          ← Goals
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">{detail.prompt || "(untitled goal)"}</h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              detail.status === "active" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {detail.status}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          {detail.steps.length} step{detail.steps.length === 1 ? "" : "s"} · {detail.campaigns.length} campaign
          {detail.campaigns.length === 1 ? "" : "s"} ({running} running)
          {detail.targetType ? ` · target: ${detail.targetType}` : ""}
        </p>
      </div>

      {/* The flow */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">The flow</h3>
        {detail.steps.length === 0 ? (
          <p className="text-sm text-slate-500">No flow steps drafted yet.</p>
        ) : (
          <ol className="space-y-3">
            {detail.steps.map((s, i) => (
              <li key={s.id || i} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500">Step {i + 1}</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${CHANNEL_COLOR[s.channel] ?? "bg-slate-100 text-slate-600"}`}>
                    {s.channel}
                  </span>
                  <span className="text-slate-400">{waitLabel(s.waitHours)}</span>
                  {s.condition !== "always" && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">if {s.condition}</span>
                  )}
                  <span className="text-slate-400">{s.personalize === "ai" ? "AI-personalised" : "verbatim"}</span>
                </div>
                {s.subject && <div className="text-sm font-medium text-slate-700">{s.subject}</div>}
                <p className="whitespace-pre-wrap text-sm text-slate-600">{s.content}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Campaigns */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Campaigns (enrolled contacts)</h3>
        {detail.campaigns.length === 0 ? (
          <p className="text-sm text-slate-500">No one enrolled yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {detail.campaigns.slice(0, 50).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{c.contact}</span>
                <span className="shrink-0 text-xs text-slate-400">step {c.currentStep}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.status === "running"
                      ? "bg-emerald-100 text-emerald-700"
                      : c.status === "done" || c.status === "converted"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        {detail.campaigns.length > 50 && (
          <p className="mt-2 text-xs text-slate-400">Showing 50 of {detail.campaigns.length}.</p>
        )}
      </div>
    </div>
  );
}
