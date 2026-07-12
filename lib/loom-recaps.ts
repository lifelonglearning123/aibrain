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
  externalId: string;
  title: string;
  url: string | null;
  summary: string;
  content: string;
  occurredAt: string | null;
}

function parseRecap(msg: GmailMessage): ParsedRecap {
  const title = msg.subject.replace(/^Recap:\s*/i, "").trim() || "Untitled recording";
  const idMatch = msg.text.match(/loom\.com\/share\/([a-f0-9]{16,})/i);
  const videoId = idMatch ? idMatch[1] : null;
  const url = videoId ? `https://www.loom.com/share/${videoId}` : null;

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

  return { externalId: videoId ?? msg.id, title, url, summary, content, occurredAt };
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

/** Pull new Loom recaps from Gmail and ingest them. `limit` caps new items per run. */
export async function ingestRecaps(opts: { limit?: number } = {}): Promise<IngestResult> {
  if (!(await openaiConfig()).configured)
    return { ok: false, processed: 0, added: 0, skipped: 0, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, processed: 0, added: 0, skipped: 0, error: "store_unavailable" };

  const limit = opts.limit ?? 25;
  const ids = await searchMessageIds(RECAP_QUERY, 150);
  if (ids.length === 0) {
    return { ok: false, processed: 0, added: 0, skipped: 0, error: "no_recaps_or_not_connected" };
  }

  let processed = 0;
  let added = 0;
  let skipped = 0;

  for (const id of ids) {
    if (added >= limit) break;
    const msg = await getMessage(id);
    if (!msg) continue;
    const p = parseRecap(msg);

    const { data: existing } = await admin
      .from("knowledge_documents")
      .select("id")
      .eq("source", "loom")
      .eq("external_id", p.externalId)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    processed++;
    const a = await analyzeRecap({ title: p.title, content: p.content });

    await admin.from("knowledge_documents").insert({
      source: "loom",
      external_id: p.externalId,
      entity_key: a.entityKey,
      scope: a.scope,
      title: p.title,
      url: p.url,
      summary: p.summary,
      content: p.content,
      occurred_at: p.occurredAt,
    });

    if (a.insights.length) {
      await admin.from("brand_knowledge").insert(
        a.insights.map((i) => ({
          scope: a.scope,
          entity_key: a.scope === "brand" ? a.entityKey : null,
          kind: i.kind,
          text: i.text,
          converts: i.converts,
          source: "loom",
        })),
      );
    }
    added++;
  }

  await admin.from("learning_runs").insert({
    entity_key: null,
    source: "loom",
    calls_seen: processed,
    insights_written: added,
    status: "success",
  });

  return { ok: true, processed, added, skipped };
}
