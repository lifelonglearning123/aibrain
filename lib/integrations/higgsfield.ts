/**
 * Higgsfield connector — rebuilt against the official API (platform.higgsfield.ai).
 * Auth: `Authorization: Key KEY_ID:KEY_SECRET` (HIGGSFIELD_API_KEY must be that pair).
 * Image:  POST /v1/text2image/{model}   body { input: { prompt, aspect_ratio } }
 * Video:  POST /v1/image2video/dop      body { input: { model, prompt, input_images:[…] } }
 *         (dop animates an image, so we generate an image from the prompt first)
 * Poll:   GET  /requests/{id}/status  → { status, images:[{url}], video:{url} }
 */

import { cred } from "@/lib/credentials";

const DEFAULT_BASE = "https://platform.higgsfield.ai";

export async function higgsfieldConfig() {
  const apiKey = await cred("HIGGSFIELD_API_KEY"); // format: KEY_ID:KEY_SECRET
  const imageModel = (await cred("HIGGSFIELD_MODEL")) ?? "flux-pro/kontext/max";
  const videoModel = (await cred("HIGGSFIELD_VIDEO_MODEL")) ?? "dop-turbo";
  const base = (await cred("HIGGSFIELD_BASE_URL")) ?? DEFAULT_BASE;
  return { apiKey, imageModel, videoModel, base, configured: Boolean(apiKey) };
}

export interface ImageResult {
  ok: boolean;
  url?: string;
  error?: string;
}
export interface SubmitResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}
export interface StatusResult {
  status: string;
  url?: string;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function hfetch(path: string, init: RequestInit): Promise<Response> {
  const { apiKey, base } = await higgsfieldConfig();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${apiKey ?? ""}`,
      "Content-Type": "application/json",
      "User-Agent": "higgsfield-server-js/2.0",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

function extractUrl(d: any): string | undefined {
  const candidates = [
    d?.video?.url,
    d?.images?.[0]?.url,
    d?.image?.url,
    d?.output?.url,
    d?.url,
  ];
  return candidates.find((x) => typeof x === "string" && x.startsWith("http"));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAILED = ["failed", "nsfw", "error", "cancelled", "canceled"];

/** Poll a request id until it has an output url or fails. */
async function pollRequest(id: string, deadlineMs = 90_000): Promise<ImageResult> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await sleep(3000);
    const st = await hfetch(`/requests/${encodeURIComponent(id)}/status`, { method: "GET" });
    if (!st.ok) continue;
    const sd: any = await st.json().catch(() => ({}));
    const url = extractUrl(sd);
    if (url) return { ok: true, url };
    if (FAILED.includes(String(sd?.status ?? "").toLowerCase())) {
      return { ok: false, error: String(sd?.status ?? "failed") };
    }
  }
  return { ok: false, error: "timeout" };
}

export async function generateImage(params: {
  prompt: string;
  aspect?: string;
}): Promise<ImageResult> {
  const { configured, imageModel } = await higgsfieldConfig();
  if (!configured) return { ok: false, error: "not_configured" };
  try {
    const res = await hfetch(`/v1/text2image/${imageModel}`, {
      method: "POST",
      body: JSON.stringify({
        input: { prompt: params.prompt, aspect_ratio: params.aspect ?? "1:1" },
      }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const data: any = await res.json().catch(() => ({}));
    const immediate = extractUrl(data);
    if (immediate) return { ok: true, url: immediate };
    const id = data?.request_id ?? data?.id;
    if (!id) return { ok: false, error: "no_request_id" };
    return await pollRequest(String(id));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "image_failed" };
  }
}

/** Generate an AI video clip: make an image from the prompt, then animate it (dop). */
export async function submitVideo(params: {
  prompt: string;
  aspect?: string;
}): Promise<SubmitResult> {
  const { configured, videoModel } = await higgsfieldConfig();
  if (!configured) return { ok: false, error: "not_configured" };
  try {
    const img = await generateImage({ prompt: params.prompt, aspect: params.aspect });
    if (!img.ok || !img.url) return { ok: false, error: img.error ?? "image_step_failed" };

    const res = await hfetch(`/v1/image2video/dop`, {
      method: "POST",
      body: JSON.stringify({
        input: {
          model: videoModel,
          prompt: params.prompt,
          input_images: [{ type: "image_url", image_url: img.url }],
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const data: any = await res.json().catch(() => ({}));
    const immediate = extractUrl(data);
    if (immediate) return { ok: true, url: immediate };
    const id = data?.request_id ?? data?.id;
    if (!id) return { ok: false, error: "no_request_id" };
    return { ok: true, id: String(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "video_failed" };
  }
}

export async function checkGeneration(id: string): Promise<StatusResult> {
  const { configured } = await higgsfieldConfig();
  if (!configured) return { status: "error", error: "not_configured" };
  try {
    const res = await hfetch(`/requests/${encodeURIComponent(id)}/status`, { method: "GET" });
    if (!res.ok) return { status: "error", error: `http_${res.status}` };
    const sd: any = await res.json().catch(() => ({}));
    const url = extractUrl(sd);
    const status = String(sd?.status ?? (url ? "completed" : "in_progress")).toLowerCase();
    return { status, url };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "status_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
