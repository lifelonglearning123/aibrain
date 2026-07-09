import { ViewHeader } from "@/components/ViewHeader";
import { EmptyState } from "@/components/EmptyState";
import { EnrollTester } from "@/components/EnrollTester";
import { SequenceDrafter } from "@/components/SequenceDrafter";
import { goalEngineConfig } from "@/lib/integrations/goal-engine";
import { openaiConfig } from "@/lib/ai/openai";
import { resolveEntity, type EntityKey } from "@/lib/entities";
import { getAccess } from "@/lib/access";

export default async function RetargetingPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const { configured, url } = await goalEngineConfig();
  const openaiReady = (await openaiConfig()).configured;
  const filter = resolveEntity(entity);
  const access = await getAccess();
  const allowedBrands = access.brands;
  const initialEntity: EntityKey = allowedBrands.includes(filter as EntityKey)
    ? (filter as EntityKey)
    : allowedBrands[0];

  return (
    <div className="space-y-6">
      <ViewHeader
        title="Retargeting"
        subtitle="Powered by your Goal Engine — AI flows into GHL"
        entity={entity}
      />

      {/* Connection status */}
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
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Linked app · retargeting engine
        </span>
      </div>

      {/* How the link works */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">How this link works</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
          <li>
            • The Brain <strong>triggers</strong> Goal Engine — it never edits its
            code, so improving Goal Engine can&apos;t break this.
          </li>
          <li>
            • Each brand maps to a Goal Engine goal/tenant; enrolling a contact
            starts its multi-channel flow (SMS · email · WhatsApp) into GHL.
          </li>
          <li>
            • Outcomes (replies, conversions) flow back and will appear here next
            to your pipeline and revenue.
          </li>
        </ul>
      </div>

      <SequenceDrafter
        openaiConfigured={openaiReady}
        initialEntity={initialEntity}
        allowedBrands={allowedBrands}
      />

      <EnrollTester configured={configured} />

      <EmptyState source="Campaigns" phase="Next">
        Registered campaigns per brand (with live status and outcomes) land here
        once we connect the Brain&apos;s database and Goal Engine&apos;s read
        feed. For now, the tester above proves the launch path works.
      </EmptyState>
    </div>
  );
}
