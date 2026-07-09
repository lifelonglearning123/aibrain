import { BriefView } from "@/components/BriefView";
import { BriefControls } from "@/components/BriefControls";
import { EmptyState } from "@/components/EmptyState";
import { supabaseConfig } from "@/lib/supabase/config";
import { openaiConfig } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { resolveEntity, ALL, entityLabel, type EntityKey } from "@/lib/entities";
import type { Brief } from "@/lib/ai/brief";

export const dynamic = "force-dynamic";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = resolveEntity(entity);
  const supa = supabaseConfig().configured;
  const openaiReady = (await openaiConfig()).configured;

  let brief: Brief | null = null;
  let createdAt: string | null = null;
  let tableMissing = false;
  let scopeLabel = "across all brands";

  if (supa) {
    const access = await getAccess();

    // Which brief to show: a specific allowed brand if selected; otherwise the
    // owner's portfolio brief, or the partner's (first) own-brand brief.
    let effectiveKey: EntityKey | null;
    if (filter !== ALL && access.brands.includes(filter as EntityKey)) {
      effectiveKey = filter as EntityKey;
    } else if (access.isOwner) {
      effectiveKey = null; // portfolio
    } else {
      effectiveKey = access.brands[0] ?? null;
    }
    scopeLabel = effectiveKey ? `for ${entityLabel(effectiveKey)}` : "across all brands";

    const supabase = await createClient();
    let query = supabase
      .from("daily_briefs")
      .select("content,created_at,entity_key")
      .order("created_at", { ascending: false })
      .limit(1);
    query = effectiveKey ? query.eq("entity_key", effectiveKey) : query.is("entity_key", null);
    const { data, error } = await query;
    if (error) tableMissing = true;
    else if (data && data[0]) {
      brief = data[0].content as Brief;
      createdAt = data[0].created_at as string;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Daily Brief</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {createdAt
              ? `Generated ${new Date(createdAt).toLocaleString("en-GB")} · ${scopeLabel}`
              : `Your morning briefing ${scopeLabel}`}
          </p>
        </div>
        <BriefControls canGenerate={supa && openaiReady && !tableMissing} />
      </div>

      {!supa ? (
        <EmptyState source="Supabase" phase="Setup">
          Connect Supabase to enable the Daily Brief.
        </EmptyState>
      ) : tableMissing ? (
        <EmptyState source="Daily Brief table" phase="Setup">
          Run <code>supabase/migrations/0005_briefs.sql</code> in Supabase, then generate your
          first brief.
        </EmptyState>
      ) : !brief ? (
        <EmptyState source="Daily Brief" phase="Ready">
          No brief yet. Click <strong>Generate now</strong> to build your first one (it reads
          revenue, pipeline, marketing and what your calls are saying — takes ~30s). After that
          it refreshes automatically each night.
        </EmptyState>
      ) : (
        <BriefView brief={brief} />
      )}
    </div>
  );
}
