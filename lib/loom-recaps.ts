import { searchMessageIds, getMessage, type GmailMessage } from "@/lib/integrations/gmail";
import { chatJSON, openaiConfig } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Loom recap ingestion. Loom emails a full AI recap (summary + action items +
 * notes) for every meeting recording, from no-reply@send.loom.com. We read those
 * from Gmail, store the full text in knowledge_documents, and distil anonymised
 * insights into brand_knowledge (source='loom') so drafts, sequences and
 * Ask-your-data all benefit. No Loom login or scraping needed.
 */

const RECAP_QUERY = "from:no-reply@send.loom.com subject:Recap";

interface ParsedRecap {
  title: string;
  url: string | null;
  summary: string;
  content: string;
  occurredAt: string | null;
}

function parseRecap(msg: GmailMessage): ParsedRecap {
  const title = msg.subject.replace(/^Recap:\s*/i, "").trim() || "Untitled recording";
  const idMatch = msg.text.match(/loom\.com\/share\/([a-f0-9]{16,})/i);
  const url = idMatch ? `https://www.loom.com/share/${idMatch[1]}` : null;

  // Trim the marketing footer.
  let content = msg.text;
  const cut = content.search(/Atlassian Pty Ltd|Change your notification settings|Unsubscribe \(/i);
  if (cut > 0) content = content.slice(0, cut);
  content = content.replace(/\r/g, "").trim();

  // Summary = the paragraph between the "… min" subheading and "View full recap".
  const sm = content.match(/min\s*\n+([\s\S]*?)\n+View full recap/i);
  const summary = (sm ? sm[1] : content.slice(0, 500)).trim();

  let occurredAt: string | null = null;
  if (msg.date) {
    const d = new Date(msg.date);
    if (!Number.isNaN(d.getTime())) occurredAt = d.toISOString();
  }

  return { title, url, summary, content, occurredAt };
}

/** Run fn over items with bounded concurrency (avoids rate limits + timeouts). */
async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function analyzeRecap(params: { title: string; content: string }): Promise<{
  scope: "shared" | "brand";
  entityKey: EntityKey | null;
  insights: { kind: string; text: string; converts: boolean }[];
}> {
  const brandList = ENTITIES.map((e) => `${e.key} (${e.name})`).join(", ");
  const system =
    "You analyse a meeting recap for a 3-brand portfolio and return JSON only. " +
    `Brands: ${brandList}. macaws is the core AI voice/automation agency. ` +
    "Tasks: (1) classify which brand this meeting most relates to; if it's general/cross-brand " +
    "know-how, use scope 'shared'. (2) Extract durable, ANONYMISED sales/marketing insights — do NOT " +
    "include any personal or company names; refer generically ('a prospect', 'a client'). " +
    "Use kinds: pain_point, objection, faq, winning_phrase, topic. Set converts=true only if it clearly " +
    "relates to a won or progressing deal. " +
    'Return ONLY JSON: {"scope":"shared"|"brand","entity_key":"<brand key or null>","insights":' +
    '[{"kind":"...","text":"...","converts":false}]} — at most 8 insights.';
  const user = `TITLE: ${params.title}\n\nRECAP:\n${params.content.slice(0, 6000)}\n\nReturn the JSON.`;

  const json = (await chatJSON(system, user)) as any;
  const validKeys = ENTITIES.map((e) => e.key) as string[];
  let scope: "shared" | "brand" = json?.scope === "brand" ? "brand" : "shared";
  const entityKey: EntityKey | null = validKeys.includes(json?.entity_key)
    ? (json.entity_key as EntityKey)
    : null;
  if (scope === "brand" && !entityKey) scope = "shared";
  const insights = Array.isArray(json?.insights)
    ? json.insights
        .filter((i: any) => i?.text)
        .map((i: any) => ({
          kind: String(i.kind || "topic"),
          text: String(i.text),
          converts: Boolean(i.converts),
        }))
        .slice(0, 8)
    : [];
  return { scope, entityKey: scope === "brand" ? entityKey : null, insights };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface IngestResult {
  ok: boolean;
  processed: number; // new recaps analysed
  added: number; // stored
  skipped: number; // already ingested
  error?: string;
}

/**
 * Pull new Loom recaps from Gmail and ingest them. Dedupes by Gmail message id
 * BEFORE fetching, then fetches + AI-analyses the new batch with bounded
 * concurrency so each request finishes well within the serverless time limit.
 * `limit` caps new items per run; call repeatedly (the button loops) to backfill.
 */
export async function ingestRecaps(opts: { limit?: number } = {}): Promise<IngestResult> {
  if (!(await openaiConfig()).configured)
    return { ok: false, processed: 0, added: 0, skipped: 0, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, processed: 0, added: 0, skipped: 0, error: "store_unavailable" };

  const limit = opts.limit ?? 12;
  const ids = await searchMessageIds(RECAP_QUERY, 300); // covers the full history
  if (ids.length === 0) {
    return { ok: false, processed: 0, added: 0, skipped: 0, error: "no_recaps_or_not_connected" };
  }

  // Dedupe against what's already stored (external_id = Gmail message id).
  const { data: existingRows } = await admin
    .from("knowledge_documents")
    .select("external_id")
    .eq("source", "loom")
    .in("external_id", ids);
  const done = new Set((existingRows ?? []).map((r) => r.external_id as string));
  const freshIds = ids.filter((id) => !done.has(id)).slice(0, limit);
  const skipped = ids.length - ids.filter((id) => !done.has(id)).length;

  if (freshIds.length === 0) {
    return { ok: true, processed: 0, added: 0, skipped };
  }

  // Fetch + parse (fast Gmail calls) then AI-analyse — both concurrency-bounded.
  const msgs = (await mapLimited(freshIds, 8, getMessage)).filter(Boolean) as GmailMessage[];
  const parsedItems = msgs.map((m) => ({ id: m.id, p: parseRecap(m) }));
  const analyses = await mapLimited(parsedItems, 4, (item) =>
    analyzeRecap({ title: item.p.title, content: item.p.content }).catch(() => ({
      scope: "shared" as const,
      entityKey: null,
      insights: [],
    })),
  );

  let added = 0;
  for (let i = 0; i < parsedItems.length; i++) {
    const { id, p } = parsedItems[i];
    const a = analyses[i];
    const { error } = await admin.from("knowledge_documents").insert({
      source: "loom",
      external_id: id,
      entity_key: a.entityKey,
      scope: a.scope,
      title: p.title,
      url: p.url,
      summary: p.summary,
      content: p.content,
      occurred_at: p.occurredAt,
    });
    if (error) continue; // unique-violation race → already ingested
    if (a.insights.length) {
      await admin.from("brand_knowledge").insert(
        a.insights.map((ins) => ({
          scope: a.scope,
          entity_key: a.scope === "brand" ? a.entityKey : null,
          kind: ins.kind,
          text: ins.text,
          converts: ins.converts,
          source: "loom",
        })),
      );
    }
    added++;
  }

  await admin.from("learning_runs").insert({
    entity_key: null,
    source: "loom",
    calls_seen: parsedItems.length,
    insights_written: added,
    status: "success",
  });

  return { ok: true, processed: parsedItems.length, added, skipped };
}
