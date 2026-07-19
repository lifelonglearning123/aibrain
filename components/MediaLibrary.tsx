"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/media";
import type { EntityKey } from "@/lib/entities";

interface MediaItem {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  kind: "video" | "image" | "other";
}

function humanSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Brand media library. Standalone on the Media page, or embedded elsewhere with
 * `onSelect` to pick a clip (Video scenes, Social post media). Uploads go
 * straight to Supabase via a signed URL, so large videos don't hit body limits.
 */
export function MediaLibrary({
  entity,
  onSelect,
  selectLabel = "Use",
  accept = "video/*",
  compact = false,
}: {
  entity: EntityKey;
  onSelect?: (url: string, kind: string) => void;
  selectLabel?: string;
  accept?: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/media?entity=${encodeURIComponent(entity)}`);
      const data = await res.json();
      setItems(data.ok ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const mb = Math.round(file.size / (1024 * 1024));
        // Fail fast on clearly-too-big files (storage global limit is ~50 MB).
        if (file.size > 250 * 1024 * 1024) {
          setError(
            `"${file.name}" is ${mb} MB — too large to upload. Trim or compress it (aim under ~50 MB), or raise the limit in Supabase → Storage settings.`,
          );
          break;
        }
        setProgress(`Uploading ${file.name}${files.length > 1 ? ` (${i + 1}/${files.length})` : ""}…`);
        // 1. Mint a signed upload URL server-side (brand-access guarded).
        const signRes = await fetch("/api/media/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entity, filename: file.name }),
        });
        const sign = await signRes.json();
        if (!sign.ok || !sign.path || !sign.token) {
          setError(sign.error ?? "upload_url_failed");
          break;
        }
        // 2. Upload the file straight to storage.
        const { error: upErr } = await supabase.storage
          .from(MEDIA_BUCKET)
          .uploadToSignedUrl(sign.path, sign.token, file);
        if (upErr) {
          setError(
            /maximum allowed size|exceeded|too large|413/i.test(upErr.message)
              ? `"${file.name}" is ${mb} MB — over the storage upload limit (~50 MB). Trim/compress it, or raise the limit in Supabase → Storage settings.`
              : upErr.message,
          );
          break;
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload_failed");
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(name: string) {
    setItems((prev) => prev.filter((m) => m.name !== name));
    await fetch(
      `/api/media?entity=${encodeURIComponent(entity)}&name=${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "↑ Upload video"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        {progress && <span className="text-xs text-slate-500">{progress}</span>}
        {!uploading && !loading && (
          <span className="text-xs text-slate-400">
            {items.length} item{items.length === 1 ? "" : "s"} · max ~50 MB each
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          No media yet. Upload the videos you&apos;ve recorded and use them in Social and Video.
        </div>
      ) : (
        <div
          className={`grid gap-3 ${compact ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}
        >
          {items.map((m) => (
            <div key={m.name} className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
              {m.kind === "video" ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={m.url} className="aspect-[9/16] w-full bg-slate-900 object-cover" muted />
              ) : m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.name} className="aspect-[9/16] w-full object-cover" />
              ) : (
                <div className="aspect-[9/16] w-full bg-slate-100" />
              )}
              <div className="flex items-center justify-between gap-1 p-1.5">
                {onSelect ? (
                  <button
                    onClick={() => onSelect(m.url, m.kind)}
                    className="rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                  >
                    {selectLabel}
                  </button>
                ) : (
                  <span className="truncate text-[11px] text-slate-400">{humanSize(m.size)}</span>
                )}
                <button
                  onClick={() => remove(m.name)}
                  title="Delete"
                  className="px-1 text-[11px] text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
