import { ghlConfigForEntity } from "@/lib/integrations/ghl";
import type { EntityKey } from "@/lib/entities";

/**
 * GoHighLevel Social Planner publishing — reuses the same per-brand Private
 * Integration Token + location we use for Pipeline. Posting is per brand/location.
 * Endpoints (GHL v2): GET /social-media-posting/{locationId}/accounts,
 * POST /social-media-posting/{locationId}/posts. Bearer + Version header.
 *
 * NOTE: exact publish-now vs scheduled/draft semantics may need one tweak against
 * a live GHL account — that's isolated to createSocialPost() below.
 */

const API_BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

/** Our platform keys → GHL account platform values. (threads/bluesky unsupported by GHL.) */
const GHL_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  linkedin: "linkedin",
  x: "twitter",
  twitter: "twitter",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
  pinterest: "pinterest",
};

export function ghlPlatformFor(platform: string): string | null {
  return GHL_PLATFORM[platform.toLowerCase()] ?? null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ghlFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

export interface GhlSocialAccount {
  id: string;
  platform: string;
  name?: string;
}

export async function listSocialAccounts(entity: EntityKey): Promise<GhlSocialAccount[]> {
  const cfg = await ghlConfigForEntity(entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) return [];
  try {
    const res = await ghlFetch(
      cfg.token,
      `/social-media-posting/${encodeURIComponent(cfg.locationId)}/accounts`,
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] =
      data?.accounts ?? data?.results?.accounts ?? data?.results ?? [];
    return items
      .map((a: any) => ({
        id: String(a.id ?? a._id ?? a.accountId ?? ""),
        platform: String(
          a.platform ?? a.type ?? a.accountType ?? a.provider ?? "",
        ).toLowerCase(),
        name: a.name ?? a.accountName ?? a.username,
      }))
      .filter((a) => a.id);
  } catch {
    return [];
  }
}

export function resolveGhlAccountIds(
  platform: string,
  accounts: GhlSocialAccount[],
): string[] {
  const target = ghlPlatformFor(platform);
  if (!target) return [];
  return accounts
    .filter((a) => a.platform === target || a.platform.includes(target))
    .map((a) => a.id);
}

export interface GhlPostResult {
  ok: boolean;
  status: number;
  error?: string;
}

export async function createSocialPost(params: {
  entity: EntityKey;
  accountIds: string[];
  text: string;
  mediaUrls?: string[];
  scheduleDate?: string;
}): Promise<GhlPostResult> {
  const cfg = await ghlConfigForEntity(params.entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) {
    return { ok: false, status: 0, error: "not_configured" };
  }

  // GHL schedules by date; use a near-future time to publish shortly ("post now").
  const scheduleDate =
    params.scheduleDate ?? new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const body: any = {
    accountIds: params.accountIds,
    summary: params.text,
    type: "post",
    scheduleDate,
  };
  if (params.mediaUrls?.length) {
    body.media = params.mediaUrls.map((url) => ({ url }));
  }

  try {
    const res = await ghlFetch(
      cfg.token,
      `/social-media-posting/${encodeURIComponent(cfg.locationId)}/posts`,
      { method: "POST", body: JSON.stringify(body) },
    );
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.message ?? data?.error ?? `http_${res.status}`,
      };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "ghl_post_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
