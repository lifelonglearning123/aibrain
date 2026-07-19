import { createAdminClient } from "@/lib/supabase/admin";
import type { EntityKey } from "@/lib/entities";

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

/** Create a signed URL the browser uploads the file directly to. */
export async function createUploadUrl(
  entity: EntityKey,
  filename: string,
): Promise<{ ok: boolean; path?: string; token?: string; error?: string }> {
  const admin = await ensureBucket();
  if (!admin) return { ok: false, error: "store_unavailable" };
  const path = `${entity}/${crypto.randomUUID()}.${safeExt(filename)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "sign_failed" };
  return { ok: true, path, token: data.token };
}

/** List a brand's uploaded media, newest first. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listMedia(entity: EntityKey): Promise<MediaItem[]> {
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
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  // Guard against path traversal — only a bare filename within the brand folder.
  if (name.includes("/") || name.includes("..")) return { ok: false, error: "bad_name" };
  const { error } = await admin.storage.from(BUCKET).remove([`${entity}/${name}`]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export { BUCKET as MEDIA_BUCKET };
