import { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/ai/openai";

/**
 * Preference capture — the compounding loop. Every time you approve, edit or
 * reject an AI draft we store the signal (content_feedback). Two things then use
 * it: getPreferenceGuidance() injects it into the NEXT draft (immediate effect,
 * even before any learning run), and distillPreferences() folds a batch of edits
 * into durable, readable rules during the learning pass (brand_knowledge
 * kind='preference'), which also show on the Insights page.
 */

export type FeedbackAction = "approve" | "edit" | "reject";

export interface FeedbackEvent {
  entity: string | null;
  kind: string; // 'social' | 'sequence'
  platform?: string | null;
  original?: string | null;
  final?: string | null;
  action: FeedbackAction;
  reason?: string | null;
}

function clip(s: string, n = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** Store approve/edit/reject events. Returns how many were written. */
export async function recordFeedback(events: FeedbackEvent[]): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const rows = events
    .filter((e) => e && (e.action === "approve" || e.action === "edit" || e.action === "reject"))
    .map((e) => ({
      entity_key: e.entity ?? null,
      kind: e.kind || "social",
      platform: e.platform ?? null,
      original: e.original ?? null,
      final: e.final ?? null,
      action: e.action,
      reason: e.reason ?? null,
    }));
  if (rows.length === 0) return 0;
  const { error } = await admin.from("content_feedback").insert(rows);
  return error ? 0 : rows.length;
}

/**
 * A prompt block describing how this brand's drafts should be written, learned
 * from real edits. Returns "" when there's nothing yet.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getPreferenceGuidance(entity: string, kind = "social"): Promise<string> {
  const admin = createAdminClient();
  if (!admin || !entity) return "";

  const [rulesRes, editsRes, rejectsRes] = await Promise.all([
    admin
      .from("brand_knowledge")
      .select("text")
      .eq("status", "active")
      .eq("kind", "preference")
      .eq("entity_key", entity),
    admin
      .from("content_feedback")
      .select("platform,original,final")
      .eq("entity_key", entity)
      .eq("kind", kind)
      .eq("action", "edit")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("content_feedback")
      .select("reason,original")
      .eq("entity_key", entity)
      .eq("kind", kind)
      .eq("action", "reject")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const parts: string[] = [];

  const rules = (rulesRes.data ?? []).map((r: any) => String(r.text)).filter(Boolean);
  if (rules.length) parts.push(`Style rules I've learned you prefer:\n- ${rules.join("\n- ")}`);

  const edits = (editsRes.data ?? []).filter((e: any) => e.original && e.final && e.original !== e.final);
  if (edits.length) {
    const examples = edits
      .map(
        (e: any) =>
          `• (${e.platform ?? "post"}) I wrote: "${clip(e.original)}" → you changed it to: "${clip(e.final)}"`,
      )
      .join("\n");
    parts.push(`Recent examples of how you edit my drafts (match this):\n${examples}`);
  }

  const rejects = (rejectsRes.data ?? [])
    .map((r: any) => (r.reason ? clip(String(r.reason)) : r.original ? `rejected: "${clip(String(r.original))}"` : ""))
    .filter(Boolean);
  if (rejects.length) parts.push(`You rejected drafts like these — avoid this:\n- ${rejects.join("\n- ")}`);

  return parts.join("\n\n");
}

/**
 * Distil a batch of edit/reject events into a handful of durable, human-readable
 * style rules. Used by the learning pass. Returns [] when there's nothing useful.
 */
export async function distillPreferences(params: {
  brandName?: string;
  events: { platform?: string | null; original?: string | null; final?: string | null; action: string; reason?: string | null }[];
}): Promise<{ text: string }[]> {
  const editOrReject = params.events.filter(
    (e) => e.action === "edit" || e.action === "reject",
  );
  if (editOrReject.length === 0) return [];

  const block = editOrReject
    .slice(0, 40)
    .map((e) => {
      if (e.action === "reject")
        return `REJECTED (${e.platform ?? "post"})${e.reason ? ` — reason: ${clip(String(e.reason))}` : ""}: "${clip(String(e.original ?? ""))}"`;
      return `EDIT (${e.platform ?? "post"}):\n  AI: "${clip(String(e.original ?? ""))}"\n  KEPT: "${clip(String(e.final ?? ""))}"`;
    })
    .join("\n\n");

  const system =
    "You analyse how a user edits and rejects AI-written marketing drafts, and extract their " +
    "durable STYLE PREFERENCES as short imperative rules a copywriter could follow (tone, length, " +
    "formatting, words to use/avoid, CTAs, emoji/hashtag habits). Only include patterns supported by " +
    'the evidence. Return ONLY JSON: {"rules":["...","..."]} — at most 8 concise rules.';
  const user = `Brand: ${params.brandName ?? "the brand"}\n\nEvidence (how the user changed/rejected drafts):\n\n${block}\n\nExtract the style rules as JSON.`;

  const json = (await chatJSON(system, user)) as { rules?: unknown } | null;
  const rules = Array.isArray(json?.rules) ? json!.rules : [];
  return rules
    .map((r) => ({ text: String(r).trim() }))
    .filter((r) => r.text.length > 0)
    .slice(0, 8);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
