import { createAdminClient } from "@/lib/supabase/admin";
import type { EntityKey } from "@/lib/entities";
import * as r2 from "@/lib/r2";

/**
 * Brand media library — a shared store of videos (and images) the user has
 * recorded/created, per brand, in a public Supabase bucket. Both Social (attach
 * to a post) and Video (use as a scene) pull from here. Large files upload
 * straight to storage via a signed URL, so they bypass serverless body limits.
 * Storage-backed (no DB table/migration): the bucket listing IS the library.
 */

const BUCKET = "brand-media";

export interface MediaItem {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  kind: "video" | "image" | "other";
}

function kindFor(name: string): MediaItem["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return "image";
  return "other";
}

/** Keep only a safe extension from a filename (default mp4 for videos). */
function safeExt(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return ext && ext.length <= 5 ? ext : "mp4";
}

async function ensureBucket() {
  const admin = createAdminClient();
  if (!admin) return null;
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  return admin;
}

export interface UploadTarget {
  ok: boolean;
  /** "put" → browser PUTs the file to uploadUrl (R2); "supabase" → uploadToSignedUrl. */
  method?: "put" | "supabase";
  uploadUrl?: string;
  publicUrl?: string;
  path?: string;
  token?: string;
  error?: string;
}

/**
 * Where new uploads go: Cloudflare R2 when its creds are set (big files, no
 * egress fees), otherwise the Supabase bucket. Both hand the browser a way to
 * upload the bytes directly, so nothing large flows through the server.
 */
export async function createUploadUrl(entity: EntityKey, filename: string): Promise<UploadTarget> {
  if ((await r2.r2Config()).configured) {
    const r = await r2.createUploadUrl(entity, filename);
    return r.ok
      ? { ok: true, method: "put", uploadUrl: r.uploadUrl, publicUrl: r.publicUrl }
      : { ok: false, error: r.error };
  }
  const admin = await ensureBucket();
  if (!admin) return { ok: false, error: "store_unavailable" };
  const path = `${entity}/${crypto.randomUUID()}.${safeExt(filename)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "sign_failed" };
  return { ok: true, method: "supabase", path, token: data.token };
}

/** Which storage is active, and the practical per-file limit to show users. */
export async function mediaBackend(): Promise<{ backend: "r2" | "supabase"; limitMb: number }> {
  return (await r2.r2Config()).configured
    ? { backend: "r2", limitMb: 5000 }
    : { backend: "supabase", limitMb: 50 };
}

/** List a brand's uploaded media, newest first. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listMedia(entity: EntityKey): Promise<MediaItem[]> {
  if ((await r2.r2Config()).configured) return r2.listMedia(entity);
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin.storage
    .from(BUCKET)
    .list(entity, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  return ((data as any[]) ?? [])
    .filter((f) => f?.id && f.name)
    .map((f) => {
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(`${entity}/${f.name}`);
      return {
        name: String(f.name),
        url: pub.publicUrl,
        size: Number(f.metadata?.size) || 0,
        createdAt: String(f.created_at ?? ""),
        kind: kindFor(String(f.name)),
      };
    });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function deleteMedia(
  entity: EntityKey,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  if ((await r2.r2Config()).configured) return r2.deleteMedia(entity, name);
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  // Guard against path traversal — only a bare filename within the brand folder.
  if (name.includes("/") || name.includes("..")) return { ok: false, error: "bad_name" };
  const { error } = await admin.storage.from(BUCKET).remove([`${entity}/${name}`]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export { BUCKET as MEDIA_BUCKET };
