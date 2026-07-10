import { fetchRecentCalls } from "@/lib/integrations/signal";
import {
  ghlConfigForEntity,
  fetchWonContactIds,
  fetchConversations,
} from "@/lib/integrations/ghl";
import { extractInsights } from "@/lib/ai/insights";
import { openaiConfig } from "@/lib/ai/openai";
import { distillPreferences } from "@/lib/preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Shared learning logic used by both the manual "Run learning" button and the
 * scheduled Vercel Cron. Each pass REPLACES its slice of the knowledge base so
 * insights stay a fresh snapshot (no unbounded growth).
 */

/** SHARED pass: Signal call summaries → portfolio-wide insights. */
export async function runSharedPass(): Promise<{ callsSeen: number; written: number }> {
  const admin = createAdminClient();
  if (!admin) return { callsSeen: 0, written: 0 };
  const calls = await fetchRecentCalls(200);
  if (calls.length === 0) return { callsSeen: 0, written: 0 };
  const shared = await extractInsights({
    calls: calls.map((c) => ({ summary: c.summary ?? "", booked: c.booked, topic: c.topic })),
    notes: [],
  });
  await admin.from("brand_knowledge").delete().eq("scope", "shared").eq("source", "signal");
  if (shared.length > 0) {
    await admin.from("brand_knowledge").insert(
      shared.map((i) => ({
        scope: "shared",
        entity_key: null,
        kind: i.kind,
        text: i.text,
        converts: i.converts,
        source: "signal",
      })),
    );
  }
  return { callsSeen: calls.length, written: shared.length };
}

/** BRAND pass: this brand's notes + GHL conversations → brand insights. */
export async function runBrandPass(entity: EntityKey): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const brandName = ENTITIES.find((e) => e.key === entity)?.name;
  let written = 0;

  const { data: noteRows } = await admin
    .from("brand_notes")
    .select("text")
    .eq("entity_key", entity)
    .order("created_at", { ascending: false })
    .limit(100);
  const notes = (noteRows ?? []).map((r) => r.text as string).filter(Boolean);
  if (notes.length > 0) {
    const brand = await extractInsights({ brandName, calls: [], notes });
    await admin
      .from("brand_knowledge")
      .delete()
      .eq("scope", "brand")
      .eq("entity_key", entity)
      .eq("source", "note");
    if (brand.length > 0) {
      await admin.from("brand_knowledge").insert(
        brand.map((i) => ({
          scope: "brand",
          entity_key: entity,
          kind: i.kind,
          text: i.text,
          converts: i.converts,
          source: "note",
        })),
      );
      written += brand.length;
    }
  }

  const ghlCfg = await ghlConfigForEntity(entity);
  if (ghlCfg.configured) {
    const [wonSet, convos] = await Promise.all([
      fetchWonContactIds(entity),
      fetchConversations(entity, 30),
    ]);
    if (convos.length > 0) {
      const items = convos.map((c) => ({
        summary: c.text,
        booked: c.contactId ? wonSet.has(c.contactId) : false,
        topic: null,
      }));
      const ghlInsights = await extractInsights({ brandName, calls: items, notes: [] });
      await admin
        .from("brand_knowledge")
        .delete()
        .eq("scope", "brand")
        .eq("entity_key", entity)
        .eq("source", "ghl");
      if (ghlInsights.length > 0) {
        await admin.from("brand_knowledge").insert(
          ghlInsights.map((i) => ({
            scope: "brand",
            entity_key: entity,
            kind: i.kind,
            text: i.text,
            converts: i.converts,
            source: "ghl",
          })),
        );
        written += ghlInsights.length;
      }
    }
  }

  // Preferences: distil recent edit/reject signals into durable style rules.
  const { data: fb } = await admin
    .from("content_feedback")
    .select("platform,original,final,action,reason")
    .eq("entity_key", entity)
    .in("action", ["edit", "reject"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (fb && fb.length > 0) {
    const rules = await distillPreferences({ brandName, events: fb });
    await admin
      .from("brand_knowledge")
      .delete()
      .eq("scope", "brand")
      .eq("entity_key", entity)
      .eq("kind", "preference")
      .eq("source", "feedback");
    if (rules.length > 0) {
      await admin.from("brand_knowledge").insert(
        rules.map((r) => ({
          scope: "brand",
          entity_key: entity,
          kind: "preference",
          text: r.text,
          converts: false,
          source: "feedback",
        })),
      );
      written += rules.length;
    }
  }

  return written;
}

export interface LearnResult {
  ok: boolean;
  callsSeen?: number;
  sharedInsights?: number;
  brandInsights?: number;
  error?: string;
}

/** Manual run: shared pass + (if a specific brand) that brand's pass. */
export async function runLearningPass(entity: string): Promise<LearnResult> {
  if (!(await openaiConfig()).configured) return { ok: false, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  try {
    const shared = await runSharedPass();
    const isBrand = ENTITIES.some((e) => e.key === entity);
    const brandInsights = isBrand ? await runBrandPass(entity as EntityKey) : 0;
    await admin.from("learning_runs").insert({
      entity_key: isBrand ? entity : null,
      source: "signal+notes+ghl",
      calls_seen: shared.callsSeen,
      insights_written: shared.written + brandInsights,
      status: "success",
    });
    return { ok: true, callsSeen: shared.callsSeen, sharedInsights: shared.written, brandInsights };
  } catch (e) {
    try {
      await admin.from("learning_runs").insert({
        entity_key: null,
        source: "signal+notes+ghl",
        status: "error",
        error: e instanceof Error ? e.message : "learn_failed",
      });
    } catch {
      /* ignore */
    }
    return { ok: false, error: e instanceof Error ? e.message : "learn_failed" };
  }
}

/**
 * Partner run: only the given brands' passes — NO shared/portfolio pass. Keeps
 * a partner's learning strictly within the companies they can access.
 */
export async function runBrandOnlyPass(entities: EntityKey[]): Promise<LearnResult> {
  if (!(await openaiConfig()).configured) return { ok: false, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  try {
    let brandInsights = 0;
    for (const e of entities) brandInsights += await runBrandPass(e);
    await admin.from("learning_runs").insert({
      entity_key: entities.length === 1 ? entities[0] : null,
      source: "notes+ghl",
      calls_seen: 0,
      insights_written: brandInsights,
      status: "success",
    });
    return { ok: true, callsSeen: 0, sharedInsights: 0, brandInsights };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "learn_failed" };
  }
}

/** Scheduled run: shared pass once + every brand. */
export async function runAllBrands(): Promise<{
  ok: boolean;
  callsSeen: number;
  sharedInsights: number;
  brandInsights: number;
  error?: string;
}> {
  if (!(await openaiConfig()).configured)
    return { ok: false, callsSeen: 0, sharedInsights: 0, brandInsights: 0, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin)
    return { ok: false, callsSeen: 0, sharedInsights: 0, brandInsights: 0, error: "store_unavailable" };
  try {
    const shared = await runSharedPass();
    let brands = 0;
    for (const e of ENTITIES) brands += await runBrandPass(e.key);
    await admin.from("learning_runs").insert({
      entity_key: null,
      source: "cron",
      calls_seen: shared.callsSeen,
      insights_written: shared.written + brands,
      status: "success",
    });
    return { ok: true, callsSeen: shared.callsSeen, sharedInsights: shared.written, brandInsights: brands };
  } catch (e) {
    try {
      await admin.from("learning_runs").insert({
        entity_key: null,
        source: "cron",
        status: "error",
        error: e instanceof Error ? e.message : "learn_failed",
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      callsSeen: 0,
      sharedInsights: 0,
      brandInsights: 0,
      error: e instanceof Error ? e.message : "learn_failed",
    };
  }
}
