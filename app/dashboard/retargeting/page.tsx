import { ViewHeader } from "@/components/ViewHeader";
import { EnrollTester } from "@/components/EnrollTester";
import { goalEngineConfig } from "@/lib/integrations/goal-engine";
import { getFunnelWinners } from "@/lib/ai/funnel-learning";
import { resolveEntity, ENTITIES, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export default async function RetargetingPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const { configured, url } = await goalEngineConfig();
  const filter = resolveEntity(entity);
  const access = await getAccess();
  const allowedBrands = access.brands;
  const initialEntity: EntityKey = allowedBrands.includes(filter as EntityKey)
    ? (filter as EntityKey)
    : allowedBrands[0];
  const winners = await getFunnelWinners(allowedBrands);
  const brandName = (k: string) => ENTITIES.find((e) => e.key === k)?.name ?? k;
  const adminUrl = url ? `${url.replace(/\/$/, "")}/admin` : null;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Retargeting"
        subtitle="Your Brain feeds Goal Engine what wins — Goal Engine writes &amp; runs the flows"
        entity={entity}
      />

      {/* Connection status + open Goal Engine */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              configured ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
          <div>
            <div className="text-sm font-semibold text-slate-800">
              Goal Engine {configured ? "connected" : "not connected"}
            </div>
            <div className="text-xs text-slate-500">
              {configured
                ? url
                : "Add GOAL_ENGINE_URL and GOAL_ENGINE_ENROLL_SECRET to activate."}
            </div>
          </div>
        </div>
        {configured && adminUrl && (
          <a
            href={adminUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Open Goal Engine ↗
          </a>
        )}
      </div>

      {/* How the loop works */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">
          The learning loop: Brain thinks, Goal Engine writes &amp; acts
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
          <li>
            • <strong>Brain → Goal Engine (knowledge):</strong> Goal Engine pulls
            your learned angles, objections and taught facts — plus the verified
            AI-voice benefit facts and the value-led (80/20) steer — from{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">GET /api/knowledge/&lt;brand&gt;</code>,
            so it writes flows that are on-brand, fact-backed and give value rather than just sell.
          </li>
          <li>
            • <strong>Goal Engine writes &amp; runs the flows:</strong> it plans
            the multi-channel sequence (SMS · email · WhatsApp) and executes it into
            GHL. You author and manage flows there — the Brain doesn&apos;t
            duplicate that.
          </li>
          <li>
            • <strong>Goal Engine → Brain (learning):</strong> outcomes are reported
            to{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">POST /api/retargeting/outcome</code>.
            Angles that repeatedly convert become <em>winning angles</em> that lead
            the next knowledge pull — the funnel improves itself.
          </li>
        </ul>
        {adminUrl && (
          <p className="mt-3 text-xs text-slate-400">
            Manage and edit your flows in{" "}
            <a href={adminUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-600 underline">
              Goal Engine
            </a>
            . The Brain&apos;s job is the knowledge + enrolment below.
          </p>
        )}
      </div>

      {/* What the funnel has learned */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            What the funnel has learned
          </h3>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            self-improving
          </span>
        </div>
        {winners.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No proven angles yet. Once Goal Engine reports outcomes, angles that
            convert (≥3 reports, ≥50% win rate) are promoted here and start leading
            the knowledge Goal Engine pulls.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {winners.map((w, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    {brandName(w.brand)}
                  </span>
                  {w.angle}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {w.evidence} signal{w.evidence === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EnrollTester
        configured={configured}
        initialEntity={initialEntity}
        allowedBrands={allowedBrands}
      />
    </div>
  );
}
