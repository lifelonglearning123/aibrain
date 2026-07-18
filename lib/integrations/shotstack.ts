/**
 * Shotstack video render connector — stitches ordered clips into one MP4.
 * Contract: header `x-api-key`; POST /render with { timeline:{tracks:[{clips}]},
 * output:{format,resolution,aspectRatio} } → { response:{ id } }; poll
 * GET /render/{id} → response.status ('queued'|'rendering'|'saving'|'fetching'|
 * 'done'|'failed') + response.url. Smart clips: start/length "auto" sequences
 * clips end-to-end at their natural length. Shotstack hosts the finished MP4.
 */

import { cred } from "@/lib/credentials";

export async function shotstackConfig() {
  const apiKey = await cred("SHOTSTACK_API_KEY");
  const env = ((await cred("SHOTSTACK_ENV")) ?? "production").toLowerCase();
  const base =
    env === "stage"
      ? "https://api.shotstack.io/stage"
      : "https://api.shotstack.io/v1";
  return { apiKey, env, base, configured: Boolean(apiKey) };
}

export interface RenderSubmit {
  ok: boolean;
  id?: string;
  error?: string;
}
export interface RenderStatus {
  status: string;
  url?: string;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function sfetch(path: string, init: RequestInit): Promise<Response> {
  const { apiKey, base } = await shotstackConfig();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey ?? "",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

/**
 * Submit a render that plays the given clips back-to-back. Returns a render id.
 * An optional per-clip `length` (seconds) trims the clip to that duration —
 * used to cut the drift/intruding-object tail that AI video models add near the
 * end of a shot. Omit it (or pass 0) to play the clip's full natural length.
 */
export async function submitRender(
  clips: { url: string; length?: number }[],
  aspect: string,
): Promise<RenderSubmit> {
  if (!(await shotstackConfig()).configured) return { ok: false, error: "not_configured" };
  if (!clips.length) return { ok: false, error: "no_clips" };

  const timelineClips = clips.map((c) => ({
    asset: { type: "video", src: c.url },
    start: "auto",
    length: c.length && c.length > 0 ? Number(c.length.toFixed(2)) : "auto",
  }));

  const body = {
    timeline: { background: "#000000", tracks: [{ clips: timelineClips }] },
    output: { format: "mp4", resolution: "hd", aspectRatio: aspect },
  };

  try {
    const res = await sfetch("/render", { method: "POST", body: JSON.stringify(body) });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      return { ok: false, error: data?.message ?? `http_${res.status}` };
    }
    const id = data?.response?.id;
    if (!id) return { ok: false, error: "no_render_id" };
    return { ok: true, id: String(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "render_failed" };
  }
}

export async function checkRender(id: string): Promise<RenderStatus> {
  if (!(await shotstackConfig()).configured) return { status: "error", error: "not_configured" };
  try {
    const res = await sfetch(`/render/${encodeURIComponent(id)}`, { method: "GET" });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "error", error: `http_${res.status}` };
    const r = data?.response ?? {};
    return { status: String(r.status ?? "unknown").toLowerCase(), url: r.url };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "status_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
