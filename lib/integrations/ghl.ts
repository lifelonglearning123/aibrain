import { ENTITIES, type EntityKey } from "@/lib/entities";
import { cred } from "@/lib/credentials";

/**
 * GoHighLevel (LeadConnector) v2 connector — one Private Integration Token +
 * location per brand (the 3 brands are separate GHL agencies). Reads the
 * opportunities pipeline live per brand; aggregated across brands in the view.
 */

const API_BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

const TOKEN_ENV: Record<EntityKey, string> = {
  macaws: "GHL_TOKEN__MACAWS",
  "artificial-ignorance": "GHL_TOKEN__ARTIFICIAL_IGNORANCE",
  leonardo: "GHL_TOKEN__LEONARDO",
};
const LOCATION_ENV: Record<EntityKey, string> = {
  macaws: "GHL_LOCATION__MACAWS",
  "artificial-ignorance": "GHL_LOCATION__ARTIFICIAL_IGNORANCE",
  leonardo: "GHL_LOCATION__LEONARDO",
};

export async function ghlConfigForEntity(entity: EntityKey) {
  const token = await cred(TOKEN_ENV[entity]);
  const locationId = await cred(LOCATION_ENV[entity]);
  const currency = await cred(`GHL_CURRENCY__${entity.toUpperCase().replace(/-/g, "_")}`);
  return { token, locationId, currency: currency ?? "GBP", configured: Boolean(token && locationId) };
}

export async function configuredGhlEntities(): Promise<EntityKey[]> {
  const checks = await Promise.all(
    ENTITIES.map(async (e) => ({ key: e.key, cfg: await ghlConfigForEntity(e.key) })),
  );
  return checks.filter((c) => c.cfg.configured).map((c) => c.key);
}

async function ghlFetch(token: string, path: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export interface StageBucket {
  name: string;
  count: number;
  valueCents: number;
}

export interface BrandPipeline {
  entityKey: EntityKey;
  name: string;
  new7d: number;
  openCount: number;
  openValueCents: number;
  wonCount: number;
  lostCount: number;
  winRate: number | null;
  stages: StageBucket[];
  currency: string;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getBrandPipeline(entity: EntityKey): Promise<BrandPipeline> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const cfg = await ghlConfigForEntity(entity);
  const base: BrandPipeline = {
    entityKey: entity,
    name,
    new7d: 0,
    openCount: 0,
    openValueCents: 0,
    wonCount: 0,
    lostCount: 0,
    winRate: null,
    stages: [],
    currency: cfg.currency,
  };
  if (!cfg.configured || !cfg.token || !cfg.locationId) {
    return { ...base, error: "not_configured" };
  }

  try {
    // Stage id → name map
    const stageNames = new Map<string, string>();
    const pipeRes = await ghlFetch(
      cfg.token,
      `/opportunities/pipelines?locationId=${encodeURIComponent(cfg.locationId)}`,
    );
    if (pipeRes.ok) {
      const pipeJson: any = await pipeRes.json();
      for (const p of pipeJson?.pipelines ?? []) {
        for (const s of p?.stages ?? []) {
          if (s?.id) stageNames.set(s.id, s.name ?? "Unnamed");
        }
      }
    }

    // Opportunities (paginated, capped)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stageBuckets = new Map<string, StageBucket>();
    for (let page = 1; page <= 10; page++) {
      const res = await ghlFetch(
        cfg.token,
        `/opportunities/search?location_id=${encodeURIComponent(cfg.locationId)}&limit=100&page=${page}`,
      );
      if (!res.ok) {
        if (page === 1) return { ...base, error: `http_${res.status}` };
        break;
      }
      const json: any = await res.json();
      const opps: any[] = json?.opportunities ?? [];
      for (const o of opps) {
        const status = String(o?.status ?? "").toLowerCase();
        const valueCents = Math.round((Number(o?.monetaryValue) || 0) * 100);
        if (o?.createdAt && new Date(o.createdAt).getTime() >= sevenDaysAgo) base.new7d += 1;
        if (status === "won") base.wonCount += 1;
        else if (status === "lost" || status === "abandoned") base.lostCount += 1;
        else {
          base.openCount += 1;
          base.openValueCents += valueCents;
          const sName = stageNames.get(o?.pipelineStageId) ?? "Unstaged";
          const b = stageBuckets.get(sName) ?? { name: sName, count: 0, valueCents: 0 };
          b.count += 1;
          b.valueCents += valueCents;
          stageBuckets.set(sName, b);
        }
      }
      if (opps.length < 100) break;
    }

    const decided = base.wonCount + base.lostCount;
    base.winRate = decided > 0 ? base.wonCount / decided : null;
    base.stages = [...stageBuckets.values()].sort((a, b) => b.count - a.count);
    return base;
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "ghl_error" };
  }
}

export interface SourceBucket {
  source: string;
  count: number;
}

export interface BrandMarketing {
  entityKey: EntityKey;
  name: string;
  totalLeads: number;
  new7d: number;
  new30d: number;
  topSource: string | null;
  bySource: SourceBucket[];
  error?: string;
}

/** Lead volume grouped by source/channel for a brand (from GHL contacts). */
export async function getBrandMarketing(entity: EntityKey): Promise<BrandMarketing> {
  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const cfg = await ghlConfigForEntity(entity);
  const base: BrandMarketing = {
    entityKey: entity,
    name,
    totalLeads: 0,
    new7d: 0,
    new30d: 0,
    topSource: null,
    bySource: [],
  };
  if (!cfg.configured || !cfg.token || !cfg.locationId) {
    return { ...base, error: "not_configured" };
  }

  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    let startAfterId: string | undefined;
    let startAfter: string | undefined;

    for (let page = 0; page < 10; page++) {
      const qs = new URLSearchParams({ locationId: cfg.locationId, limit: "100" });
      if (startAfterId) qs.set("startAfterId", startAfterId);
      if (startAfter) qs.set("startAfter", startAfter);

      const res = await ghlFetch(cfg.token, `/contacts/?${qs.toString()}`);
      if (!res.ok) {
        if (page === 0) return { ...base, error: `http_${res.status}` };
        break;
      }
      const json: any = await res.json();
      const contacts: any[] = json?.contacts ?? [];
      for (const c of contacts) {
        base.totalLeads += 1;
        const src = String(c?.source ?? c?.attributionSource?.source ?? "Unknown") || "Unknown";
        counts.set(src, (counts.get(src) ?? 0) + 1);
        const added = c?.dateAdded ? new Date(c.dateAdded).getTime() : NaN;
        if (!Number.isNaN(added)) {
          if (added >= sevenDaysAgo) base.new7d += 1;
          if (added >= thirtyDaysAgo) base.new30d += 1;
        }
      }
      const meta = json?.meta;
      if (!meta?.nextPageUrl || contacts.length < 100) break;
      startAfterId = meta?.startAfterId ? String(meta.startAfterId) : undefined;
      startAfter = meta?.startAfter != null ? String(meta.startAfter) : undefined;
      if (!startAfterId) break;
    }

    base.bySource = [...counts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
    base.topSource = base.bySource[0]?.source ?? null;
    return base;
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "ghl_error" };
  }
}

export interface DealLine {
  name: string;
  value: number; // major units
  stage: string;
  contact: string | null;
}

/** Top open opportunities by value for a brand — the detail behind "biggest deals". */
export async function listTopDeals(
  entity: EntityKey,
  limit = 10,
): Promise<{ deals: DealLine[]; currency: string; error?: string }> {
  const cfg = await ghlConfigForEntity(entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) {
    return { deals: [], currency: cfg.currency, error: "not_configured" };
  }
  try {
    const stageNames = new Map<string, string>();
    const pipeRes = await ghlFetch(
      cfg.token,
      `/opportunities/pipelines?locationId=${encodeURIComponent(cfg.locationId)}`,
    );
    if (pipeRes.ok) {
      const pj: any = await pipeRes.json();
      for (const p of pj?.pipelines ?? [])
        for (const s of p?.stages ?? []) if (s?.id) stageNames.set(s.id, s.name ?? "Unnamed");
    }

    const open: DealLine[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await ghlFetch(
        cfg.token,
        `/opportunities/search?location_id=${encodeURIComponent(cfg.locationId)}&limit=100&page=${page}`,
      );
      if (!res.ok) {
        if (page === 1) return { deals: [], currency: cfg.currency, error: `http_${res.status}` };
        break;
      }
      const json: any = await res.json();
      const opps: any[] = json?.opportunities ?? [];
      for (const o of opps) {
        if (String(o?.status ?? "").toLowerCase() !== "open") continue;
        open.push({
          name: o?.name || o?.contact?.name || "Unnamed deal",
          value: (Number(o?.monetaryValue) || 0),
          stage: stageNames.get(o?.pipelineStageId) ?? "Unstaged",
          contact: o?.contact?.name ?? null,
        });
      }
      if (opps.length < 100) break;
    }
    open.sort((a, b) => b.value - a.value);
    return { deals: open.slice(0, Math.max(1, Math.min(limit, 50))), currency: cfg.currency };
  } catch (e) {
    return { deals: [], currency: cfg.currency, error: e instanceof Error ? e.message : "ghl_error" };
  }
}

// ── Learning sources: won-deal contacts (conversion signal) + conversations ──

/** Contact ids that have a WON opportunity — used as the conversion signal. */
export async function fetchWonContactIds(entity: EntityKey): Promise<Set<string>> {
  const cfg = await ghlConfigForEntity(entity);
  const won = new Set<string>();
  if (!cfg.configured || !cfg.token || !cfg.locationId) return won;
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await ghlFetch(
        cfg.token,
        `/opportunities/search?location_id=${encodeURIComponent(cfg.locationId)}&limit=100&page=${page}`,
      );
      if (!res.ok) break;
      const json: any = await res.json();
      const opps: any[] = json?.opportunities ?? [];
      for (const o of opps) {
        if (String(o?.status ?? "").toLowerCase() === "won") {
          const cid = o?.contactId ?? o?.contact?.id;
          if (cid) won.add(String(cid));
        }
      }
      if (opps.length < 100) break;
    }
  } catch {
    /* ignore */
  }
  return won;
}

export interface GhlConversation {
  contactId: string | null;
  text: string;
}

/**
 * The owner's own recent OUTBOUND messages (email/SMS), as raw voice samples for
 * the Business Context "voice" box — so drafting sounds like them, auto-filled.
 * Substantive prose only; HTML stripped; automated/footer-only messages skipped.
 */
export async function fetchOutboundSamples(entity: EntityKey, limit = 3): Promise<string[]> {
  const cfg = await ghlConfigForEntity(entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) return [];
  const found: string[] = [];
  try {
    const res = await ghlFetch(
      cfg.token,
      `/conversations/search?locationId=${encodeURIComponent(cfg.locationId)}&limit=25`,
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    const convos: any[] = json?.conversations ?? [];
    for (const c of convos) {
      const id = c?.id;
      if (!id) continue;
      const mres = await ghlFetch(cfg.token, `/conversations/${encodeURIComponent(id)}/messages`);
      if (!mres.ok) continue;
      const mjson: any = await mres.json();
      const msgs: any[] = mjson?.messages?.messages ?? mjson?.messages ?? [];
      for (const m of msgs) {
        if (String(m?.direction ?? "").toLowerCase() !== "outbound") continue;
        let body = String(m?.body ?? m?.message ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&#39;/g, " ")
          .replace(/https?:\/\/\S+/g, "")
          .replace(/location\s+logo/gi, "")
          .replace(/[[\]]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (body.length < 120) continue; // want real prose, not "ok"/links
        // Skip automated/transactional templates — they're not the owner's voice.
        if (
          /invoice|payment (is )?success|\breceipt\b|view invoice|\bINV[- ]?\d|amount (due|paid|remaining)|unsubscribe|view in browser|no-?reply|do not reply|verify your|reset your|one-time (code|password)|order #|©\s*\d{4}|accept invite|single-use|you'?ve been invited|invited to join|welcome to/i.test(
            body,
          )
        )
          continue;
        found.push(body.slice(0, 600));
      }
      if (found.length >= limit * 4) break;
    }
  } catch {
    /* best-effort */
  }
  // Most substantive first, de-duplicated.
  const seen = new Set<string>();
  return found
    .sort((a, b) => b.length - a.length)
    .filter((s) => {
      const k = s.slice(0, 50).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** Recent conversations (email/SMS) with their message bodies (anonymised text only). */
export async function fetchConversations(
  entity: EntityKey,
  limit = 30,
): Promise<GhlConversation[]> {
  const cfg = await ghlConfigForEntity(entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) return [];
  const out: GhlConversation[] = [];
  try {
    const res = await ghlFetch(
      cfg.token,
      `/conversations/search?locationId=${encodeURIComponent(cfg.locationId)}&limit=${limit}`,
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    const convos: any[] = json?.conversations ?? [];
    for (const c of convos.slice(0, limit)) {
      const id = c?.id;
      if (!id) continue;
      const contactId = c?.contactId ?? c?.contact_id ?? null;
      const mres = await ghlFetch(cfg.token, `/conversations/${encodeURIComponent(id)}/messages`);
      if (!mres.ok) continue;
      const mjson: any = await mres.json();
      const msgs: any[] = mjson?.messages?.messages ?? mjson?.messages ?? [];
      const text = msgs
        .map((m) => m?.body ?? m?.message ?? "")
        .filter((t: string) => typeof t === "string" && t.trim())
        .join("\n")
        .slice(0, 4000);
      if (text) out.push({ contactId: contactId ? String(contactId) : null, text });
    }
  } catch {
    /* ignore */
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
