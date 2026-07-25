import Link from "next/link";
import { ViewHeader } from "@/components/ViewHeader";
import { getAccess } from "@/lib/access";
import { shadowStatus, dueQueuePreview, sampleShadowSends, recentActivity } from "@/lib/goal-engine/shadow";
import type { StepPreview } from "@/lib/goal-engine/engine/executor/executeStep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DECISION_STYLE: Record<string, string> = {
  would_send: "bg-emerald-100 text-emerald-700",
  would_advance: "bg-sky-100 text-sky-700",
  would_skip: "bg-slate-100 text-slate-600",
  would_defer: "bg-amber-100 text-amber-700",
  would_halt: "bg-rose-100 text-rose-700",
};
const DECISION_LABEL: Record<string, string> = {
  would_send: "would send",
  would_advance: "would advance",
  would_skip: "would skip",
  would_defer: "would wait (quiet hours)",
  would_halt: "would stop",
};

function PreviewCard({ p, goalPrompt }: { p: StepPreview; goalPrompt?: string }) {
  return (
    <li className="rounded-lg border border-slate-100 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${DECISION_STYLE[p.decision] ?? "bg-slate-100 text-slate-600"}`}>
          {DECISION_LABEL[p.decision] ?? p.decision}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium capitalize text-slate-600">{p.channel}</span>
        {p.contact && <span className="text-slate-500">to {p.contact}</span>}
        <span className="text-slate-400">step {p.stepIndex + 1}</span>
        {p.reason && <span className="text-slate-400">· {p.reason}</span>}
      </div>
      {goalPrompt && <div className="mb-1 truncate text-xs text-slate-400" title={goalPrompt}>goal: {goalPrompt}</div>}
      {p.subject && <div className="text-sm font-medium text-slate-700">{p.subject}</div>}
      {p.message && <p className="whitespace-pre-wrap text-sm text-slate-600">{p.message}</p>}
    </li>
  );
}

export default async function ExecutionPage() {
  const access = await getAccess();
  if (!access.isOwner) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Execution controls are owner-only.
      </div>
    );
  }

  const status = await shadowStatus();
  const live = status.executionEnabled;

  if (!status.dbReady) {
    return (
      <div className="space-y-6">
        <ViewHeader title="Execution" subtitle="How the Brain runs your retargeting flows" />
        <p className="text-sm text-slate-500">Goal Engine database not connected.</p>
      </div>
    );
  }

  const [activity, dueNow, sample] = await Promise.all([
    recentActivity(),
    dueQueuePreview(25),
    sampleShadowSends(5),
  ]);
  const wouldSendNow = dueNow.filter((p) => p.decision === "would_send").length;

  return (
    <div className="space-y-6">
      <ViewHeader title="Execution" subtitle="How the Brain runs your retargeting flows" />

      {/* Mode banner */}
      <div className={`rounded-xl border p-5 ${live ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50"}`}>
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${live ? "bg-emerald-500" : "bg-sky-500"}`} />
          <div className="text-sm font-semibold text-slate-800">
            {live ? "LIVE — the Brain is running your flows" : "SHADOW — the Brain is watching, not sending"}
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {live
            ? "Every minute the Brain claims due steps and sends them (SMS · email · WhatsApp). This is the merged Goal Engine running inside the Brain."
            : "The Brain simulates exactly what it would send — composing the real, personalised message — but sends nothing and changes nothing. The live Goal Engine still runs your flows. This proves the Brain is ready before you flip it on."}
        </p>
        {!live && (
          <p className="mt-2 text-xs text-slate-500">
            To go live, follow <code className="rounded bg-white/70 px-1">references/goal-engine-cutover.md</code> —
            it&apos;s a single switch (<code className="rounded bg-white/70 px-1">GOAL_ENGINE_EXECUTE=true</code>) done
            together with turning the old Goal Engine crons off.
          </p>
        )}
      </div>

      {/* Readiness + live-GE activity */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Execution mode" value={live ? "Live" : "Shadow"} good={!live || status.dbReady} />
        <Stat label="Sends by Goal Engine (24h)" value={String(activity.sent24h)} />
        <Stat label="Cron secret" value={status.cronSecretSet ? "set" : "missing"} good={status.cronSecretSet} />
        <Stat label="Token decrypt key" value={status.encryptionKeySet ? "set" : "missing"} good={status.encryptionKeySet} />
      </div>

      {/* What it would send to real running campaigns right now */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">What the Brain would send next — sampled from live campaigns</h3>
        <p className="mt-1 text-xs text-slate-500">
          A few running campaigns, with the exact message the Brain&apos;s executor composes for each one&apos;s current
          step — right now, read-only. This is the same code that will run when you go live.
        </p>
        {sample.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No running campaigns to sample.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sample.map((p, i) => (
              <PreviewCard key={i} p={p} goalPrompt={p.goalPrompt} />
            ))}
          </ul>
        )}
      </div>

      {/* Due right now */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Due right now</h3>
          <span className="text-xs text-slate-400">{dueNow.length} due · {wouldSendNow} would send</span>
        </div>
        {dueNow.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing due this instant.{" "}
            {!live && "In shadow mode this is usually empty — the live Goal Engine processes each due step within the minute, so use the sample above to see what the Brain would do."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {dueNow.map((p, i) => (
              <PreviewCard key={i} p={p} />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400">
        <Link href="/dashboard/goals" className="font-medium text-slate-500 hover:text-slate-700">← Goals &amp; campaigns</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${good === false ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
