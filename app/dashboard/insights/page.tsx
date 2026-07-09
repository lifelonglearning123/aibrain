import { ViewHeader } from "@/components/ViewHeader";
import { EmptyState } from "@/components/EmptyState";
import { InsightsPanel } from "@/components/InsightsPanel";
import { resolveEntity, ALL, entityLabel } from "@/lib/entities";
import { openaiConfig } from "@/lib/ai/openai";
import { signalConfig } from "@/lib/integrations/signal";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

interface Row {
  kind: string;
  text: string;
  converts: boolean;
  scope: string;
  entity_key: string | null;
  source: string;
}

const GROUPS: { kind: string; label: string }[] = [
  { kind: "pain_point", label: "Pain points" },
  { kind: "objection", label: "Objections" },
  { kind: "faq", label: "Frequently asked" },
  { kind: "winning_phrase", label: "Winning phrases" },
  { kind: "topic", label: "Topics" },
];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = resolveEntity(entity);
  const supa = supabaseConfig().configured;
  const access = await getAccess();
  const [openai, signal] = await Promise.all([openaiConfig(), signalConfig()]);

  let rows: Row[] = [];
  let tableMissing = false;
  let lastRun: { created_at: string; calls_seen: number; insights_written: number } | null =
    null;

  if (supa) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("brand_knowledge")
      .select("kind,text,converts,scope,entity_key,source")
      .eq("status", "active");
    if (error) tableMissing = true;
    else {
      rows = (data ?? []).filter((r) => {
        // Cross-brand "shared" lessons are owner-only — partners see just their brand.
        if (r.scope === "shared") return access.isOwner;
        if (!r.entity_key || !access.brands.includes(r.entity_key as never)) return false;
        return filter === ALL || r.entity_key === filter;
      }) as Row[];
    }
    const { data: runs } = await supabase
      .from("learning_runs")
      .select("created_at,calls_seen,insights_written")
      .order("created_at", { ascending: false })
      .limit(1);
    lastRun = runs?.[0] ?? null;
  }

  const canLearn = openai.configured && supa;

  // The learn/note actions need a concrete brand. If a partner has exactly one
  // company, default the panel to it (so it works without picking from the
  // switcher first). Owners / multi-brand partners keep the current filter.
  const panelEntity =
    filter === ALL && !access.isOwner && access.brands.length === 1
      ? access.brands[0]
      : filter;

  return (
    <div className="space-y-6">
      <ViewHeader
        title="AI Insights"
        subtitle="What the brain has learned — from calls, notes &amp; conversations"
        entity={entity}
      />

      {!supa ? (
        <EmptyState source="Supabase" phase="Setup">
          Connect Supabase and run migration <code>0004_learning.sql</code> to enable the
          learning engine.
        </EmptyState>
      ) : tableMissing ? (
        <EmptyState source="Learning tables" phase="Setup">
          Run <code>supabase/migrations/0004_learning.sql</code> in Supabase to create the
          knowledge tables, then run learning.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${signal.configured ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span className="font-medium text-slate-700">Signal {signal.configured ? "connected" : "not connected"}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${openai.configured ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span className="font-medium text-slate-700">Extraction {openai.configured ? "ready (gpt-5.5)" : "needs OpenAI"}</span>
            </span>
            {lastRun && (
              <span className="text-slate-400">
                Last run: {lastRun.calls_seen} calls → {lastRun.insights_written} insights
              </span>
            )}
          </div>

          <InsightsPanel
            entity={panelEntity}
            canLearn={canLearn}
            signalConnected={signal.configured}
          />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Learned knowledge · {entityLabel(filter)}
            </h2>
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                Nothing learned yet — add a note or run learning to populate this.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {GROUPS.map((g) => {
                  const items = rows.filter((r) => r.kind === g.kind);
                  if (items.length === 0) return null;
                  return (
                    <div key={g.kind} className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {g.label}
                      </h3>
                      <ul className="space-y-2">
                        {items.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                            {r.converts && (
                              <span
                                title="Associated with bookings"
                                className="mt-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                              >
                                converts
                              </span>
                            )}
                            <span>{r.text}</span>
                            <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                              {r.scope === "shared" ? "shared" : "brand"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
