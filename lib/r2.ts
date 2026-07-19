import { AwsClient } from "aws4fetch";
import { cred } from "@/lib/credentials";
import type { EntityKey } from "@/lib/entities";
import type { MediaItem } from "@/lib/media";

/**
 * Cloudflare R2 storage backend for the media library — an S3-compatible store
 * with a big free tier and no egress fees, so it holds large videos the
 * Supabase bucket's ~50 MB cap can't. Uploads use a presigned PUT (browser →
 * R2 directly). Active only when the R2_* credentials are set; otherwise the
 * media library falls back to Supabase. Signed with aws4fetch (tiny, no SDK).
 */

export async function r2Config() {
  const accountId = await cred("R2_ACCOUNT_ID");
  const accessKeyId = await cred("R2_ACCESS_KEY_ID");
  const secretAccessKey = await cred("R2_SECRET_ACCESS_KEY");
  const bucket = await cred("R2_BUCKET");
  const publicBase = (await cred("R2_PUBLIC_BASE_URL"))?.replace(/\/+$/, "");
  const endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "";
  const configured = Boolean(accountId && accessKeyId && secretAccessKey && bucket && publicBase);
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase, endpoint, configured };
}

function kindFor(name: string): MediaItem["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return "image";
  return "other";
}

function safeExt(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return ext && ext.length <= 5 ? ext : "mp4";
}

async function client() {
  const cfg = await r2Config();
  const aws = new AwsClient({
    accessKeyId: cfg.accessKeyId!,
    secretAccessKey: cfg.secretAccessKey!,
    service: "s3",
    region: "auto",
  });
  return { cfg, aws };
}

/** Presigned PUT URL for a direct browser → R2 upload, plus the eventual public URL. */
export async function createUploadUrl(
  entity: EntityKey,
  filename: string,
): Promise<{ ok: boolean; uploadUrl?: string; publicUrl?: string; error?: string }> {
  const { cfg, aws } = await client();
  if (!cfg.configured) return { ok: false, error: "not_configured" };
  const key = `${entity}/${crypto.randomUUID()}.${safeExt(filename)}`;
  try {
    const signed = await aws.sign(
      `${cfg.endpoint}/${cfg.bucket}/${key}?X-Amz-Expires=900`,
      { method: "PUT", aws: { signQuery: true } },
    );
    return { ok: true, uploadUrl: signed.url, publicUrl: `${cfg.publicBase}/${key}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sign_failed" };
  }
}

/** List a brand's media via S3 ListObjectsV2 (XML), newest first. */
export async function listMedia(entity: EntityKey): Promise<MediaItem[]> {
  const { cfg, aws } = await client();
  if (!cfg.configured) return [];
  try {
    const url = `${cfg.endpoint}/${cfg.bucket}?list-type=2&prefix=${encodeURIComponent(entity + "/")}&max-keys=200`;
    const res = await aws.fetch(url, { method: "GET" });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: MediaItem[] = [];
    const blocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
    for (const block of blocks) {
      const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "";
      if (!key || key.endsWith("/")) continue;
      const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0);
      const lm = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? "";
      const name = key.slice(key.indexOf("/") + 1);
      items.push({
        name,
        url: `${cfg.publicBase}/${key}`,
        size,
        createdAt: lm,
        kind: kindFor(name),
      });
    }
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteMedia(
  entity: EntityKey,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if (name.includes("/") || name.includes("..")) return { ok: false, error: "bad_name" };
  const { cfg, aws } = await client();
  if (!cfg.configured) return { ok: false, error: "not_configured" };
  try {
    const res = await aws.fetch(`${cfg.endpoint}/${cfg.bucket}/${entity}/${name}`, {
      method: "DELETE",
    });
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "delete_failed" };
  }
}
