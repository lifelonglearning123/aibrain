/**
 * Higgsfield connector — rebuilt against the official API (platform.higgsfield.ai).
 * Auth: `Authorization: Key KEY_ID:KEY_SECRET` (HIGGSFIELD_API_KEY must be that pair).
 * Image:  POST /v1/text2image/soul   body { prompt, width_and_height, quality, batch_size }
 * Video:  POST /v1/image2video/dop   body { input: { model, prompt, input_images:[…] } }
 *         (dop animates an image, so we generate an image from the prompt first)
 * Poll:   GET  /requests/{id}/status  → { status, jobs:[{results:{raw:{url}}}] / images:[{url}] }
 */

import { cred } from "@/lib/credentials";

const DEFAULT_BASE = "https://platform.higgsfield.ai";

export async function higgsfieldConfig() {
  const apiKey = await cred("HIGGSFIELD_API_KEY"); // format: KEY_ID:KEY_SECRET
  // V1 text→image model at /v1/text2image/{model}. "soul" is Higgsfield's own.
  const imageModel = (await cred("HIGGSFIELD_MODEL")) ?? "soul";
  const videoModel = (await cred("HIGGSFIELD_VIDEO_MODEL")) ?? "dop-turbo";
  const base = (await cred("HIGGSFIELD_BASE_URL")) ?? DEFAULT_BASE;
  return { apiKey, imageModel, videoModel, base, configured: Boolean(apiKey) };
}

/** Map our UI aspect ratios to Higgsfield "soul" width_and_height (WxH strings). */
function soulSize(aspect?: string): string {
  switch (aspect) {
    case "16:9":
      return "2048x1536";
    case "9:16":
    case "4:5":
      return "1536x2048";
    default:
      return "1536x1536"; // 1:1
  }
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
    // Higgsfield job-set shapes
    d?.jobs?.[0]?.results?.raw?.url,
    d?.jobs?.[0]?.results?.min?.url,
    d?.jobs?.[0]?.result?.url,
    d?.results?.raw?.url,
  ];
  return candidates.find((x) => typeof x === "string" && x.startsWith("http"));
}

function extractId(d: any): string | undefined {
  const id = d?.request_id ?? d?.id ?? d?.job_set_id ?? d?.jobs?.[0]?.id;
  return id ? String(id) : undefined;
}

/** Pull a useful message out of a non-OK Higgsfield response (for debugging). */
async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    return `${res.status}: ${text.slice(0, 300) || "error"}`;
  }
  const m = body?.message ?? body?.error?.message ?? body?.error ?? body?.detail ?? body;
  const s = typeof m === "string" ? m : JSON.stringify(m);
  return `${res.status}: ${s.slice(0, 400)}`;
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

/**
 * Submit a text→image job WITHOUT blocking to completion. Returns an immediate
 * url if the API gives one, otherwise a job id the client polls via
 * /api/social/image/status. Keeps each serverless request short (no timeout).
 */
/** V1 text→image request body — wrapped in "params" as /v1/text2image/soul expects. */
function imageBody(params: { prompt: string; aspect?: string; enhance?: boolean }) {
  return JSON.stringify({
    params: {
      prompt: params.prompt,
      width_and_height: soulSize(params.aspect),
      quality: "1080p",
      batch_size: 1,
      // Off when our art director wrote the prompt — Higgsfield's generic
      // enhancer is what produces the stock "AI look".
      enhance_prompt: params.enhance ?? true,
    },
  });
}

export async function submitImage(params: {
  prompt: string;
  aspect?: string;
  enhance?: boolean;
}): Promise<SubmitResult> {
  const { configured, imageModel } = await higgsfieldConfig();
  if (!configured) return { ok: false, error: "not_configured" };
  try {
    const res = await hfetch(`/v1/text2image/${imageModel}`, { method: "POST", body: imageBody(params) });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data: any = await res.json().catch(() => ({}));
    const immediate = extractUrl(data);
    if (immediate) return { ok: true, url: immediate };
    const id = extractId(data);
    if (!id) return { ok: false, error: "no_request_id" };
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "image_failed" };
  }
}

/** Blocking image generation (used internally by the video step). */
export async function generateImage(params: {
  prompt: string;
  aspect?: string;
}): Promise<ImageResult> {
  const { configured, imageModel } = await higgsfieldConfig();
  if (!configured) return { ok: false, error: "not_configured" };
  try {
    const res = await hfetch(`/v1/text2image/${imageModel}`, { method: "POST", body: imageBody(params) });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data: any = await res.json().catch(() => ({}));
    const immediate = extractUrl(data);
    if (immediate) return { ok: true, url: immediate };
    const id = extractId(data);
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
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data: any = await res.json().catch(() => ({}));
    const immediate = extractUrl(data);
    if (immediate) return { ok: true, url: immediate };
    const id = extractId(data);
    if (!id) return { ok: false, error: "no_request_id" };
    return { ok: true, id };
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
