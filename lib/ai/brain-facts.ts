import { createAdminClient } from "@/lib/supabase/admin";
import { type EntityKey } from "@/lib/entities";

/**
 * Taught facts / corrections — durable truths the user teaches the brain that it
 * CANNOT compute (e.g. "these are test accounts", "trust invoices over the P&L").
 * Unlike learned insights (semantic search) these are ALWAYS injected into Ask, so
 * the brain stops repeating a known-wrong interpretation. Stored in brand_knowledge
 * with kind='correction' (reuses its access scoping; never embedded — see
 * embeddings.ts). This is the "learning loop": you correct it once, it sticks.
 */

export interface TaughtFact {
  id: string;
  text: string;
  scope: "shared" | "brand";
  entityKey: string | null;
}

/** Active taught facts for this user's companies (+ portfolio-wide for owners). */
export async function getTaughtFacts(
  brands: EntityKey[],
  isOwner: boolean,
): Promise<TaughtFact[]> {
  const admin = createAdminClient();
  if (!admin || brands.length === 0) return [];
  let q = admin
    .from("brand_knowledge")
    .select("id,text,scope,entity_key")
    .eq("kind", "correction")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(60);
  // Partners: only their brands' facts. Owners: their brands' facts + shared.
  if (isOwner) {
    q = q.or(`scope.eq.shared,entity_key.in.(${brands.join(",")})`);
  } else {
    q = q.eq("scope", "brand").in("entity_key", brands);
  }
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    scope: (r.scope as "shared" | "brand") ?? "shared",
    entityKey: (r.entity_key as string | null) ?? null,
  }));
}

/** Teach the brain a durable fact/correction. Owner action. */
export async function addTaughtFact(params: {
  text: string;
  entityKey: EntityKey | null; // null = applies to the whole portfolio
  createdBy?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  const text = params.text.trim();
  if (!text) return { ok: false, error: "empty" };
  const { error } = await admin.from("brand_knowledge").insert({
    kind: "correction",
    text,
    scope: params.entityKey ? "brand" : "shared",
    entity_key: params.entityKey,
    status: "active",
    converts: false,
    source: params.createdBy ? `taught:${params.createdBy}` : "taught",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
