/**
 * Blotato connector — publishes posts across social platforms.
 * Contract (help.blotato.com): base https://backend.blotato.com/v2, header
 * `blotato-api-key`. GET /users/me/accounts lists connected accounts;
 * POST /posts publishes: { post:{ accountId, content:{text,mediaUrls,platform},
 * target:{targetType} }, scheduledTime? }. content.platform === target.targetType.
 */

const BASE = "https://backend.blotato.com/v2";

export function blotatoConfig() {
  const apiKey = process.env.BLOTATO_API_KEY;
  return { apiKey, configured: Boolean(apiKey) };
}

/** Our platform keys → Blotato targetType. (Note: our "x" → Blotato "twitter".) */
const PLATFORM_TARGET: Record<string, string> = {
  instagram: "instagram",
  linkedin: "linkedin",
  x: "twitter",
  twitter: "twitter",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
  threads: "threads",
  pinterest: "pinterest",
  bluesky: "bluesky",
};

export function targetTypeFor(platform: string): string | null {
  return PLATFORM_TARGET[platform.toLowerCase()] ?? null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function bfetch(path: string, init: RequestInit): Promise<Response> {
  const { apiKey } = blotatoConfig();
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "blotato-api-key": apiKey ?? "",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export interface BlotatoAccount {
  id: string;
  platform: string;
  name?: string;
}

export async function listAccounts(): Promise<BlotatoAccount[]> {
  if (!blotatoConfig().configured) return [];
  try {
    const res = await bfetch("/users/me/accounts", { method: "GET" });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = Array.isArray(data)
      ? data
      : (data.items ?? data.accounts ?? data.data ?? []);
    return items
      .map((a: any) => ({
        id: String(a.id ?? a.accountId ?? a._id ?? ""),
        platform: String(
          a.platform ?? a.type ?? a.targetType ?? a.network ?? "",
        ).toLowerCase(),
        name: a.username ?? a.name ?? a.handle,
      }))
      .filter((a) => a.id);
  } catch {
    return [];
  }
}

function envAccount(platform: string): string | undefined {
  return process.env[`BLOTATO_ACCOUNT__${platform.toUpperCase()}`];
}

/** Pick the account id to publish this platform with (env override wins, else first match). */
export function resolveAccountId(
  platform: string,
  accounts: BlotatoAccount[],
): string | undefined {
  const target = targetTypeFor(platform);
  const override =
    envAccount(platform) ?? (platform === "x" ? envAccount("twitter") : undefined);
  if (override) return override;
  if (!target) return undefined;
  return accounts.find((a) => a.platform === target || a.platform === platform.toLowerCase())?.id;
}

export interface PublishResult {
  platform: string;
  ok: boolean;
  status: number;
  error?: string;
}

export async function publishPost(params: {
  accountId: string;
  platform: string;
  text: string;
  mediaUrls?: string[];
  scheduledTime?: string;
}): Promise<PublishResult> {
  const { platform } = params;
  const target = targetTypeFor(platform);
  if (!blotatoConfig().configured)
    return { platform, ok: false, status: 0, error: "not_configured" };
  if (!target) return { platform, ok: false, status: 0, error: "unsupported_platform" };

  const body: any = {
    post: {
      accountId: params.accountId,
      content: { text: params.text, mediaUrls: params.mediaUrls ?? [], platform: target },
      target: { targetType: target },
    },
  };
  if (params.scheduledTime) body.scheduledTime = params.scheduledTime;

  try {
    const res = await bfetch("/posts", { method: "POST", body: JSON.stringify(body) });
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      return {
        platform,
        ok: false,
        status: res.status,
        error: data?.error ?? data?.message ?? `http_${res.status}`,
      };
    }
    return { platform, ok: true, status: res.status };
  } catch (e) {
    return {
      platform,
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "publish_failed",
    };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
