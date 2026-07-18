import { cred } from "@/lib/credentials";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Text-to-speech for video voiceovers. Uses OpenAI's /audio/speech (the brain's
 * default provider — same key as gpt-5.5), renders an MP3, and hosts it in a
 * public Supabase bucket so Shotstack can fetch it as the render soundtrack.
 */

const BUCKET = "social-audio";

export const TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export async function ttsConfig() {
  const apiKey = await cred("OPENAI_API_KEY");
  // tts-1-hd is high quality and stable on /audio/speech; override if desired.
  const model = (await cred("OPENAI_TTS_MODEL")) ?? "tts-1-hd";
  const voice = (await cred("OPENAI_TTS_VOICE")) ?? "onyx";
  return { apiKey, model, voice, configured: Boolean(apiKey) };
}

export interface TtsResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Synthesize speech and upload the MP3; returns a public URL Shotstack can use. */
export async function synthesizeSpeech(
  text: string,
  voiceOverride?: string,
): Promise<TtsResult> {
  const { apiKey, model, voice } = await ttsConfig();
  if (!apiKey) return { ok: false, error: "not_configured" };
  const input = text.trim().slice(0, 4000);
  if (!input) return { ok: false, error: "empty_text" };

  let buf: Buffer;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        voice: voiceOverride || voice,
        input,
        response_format: "mp3",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `tts_${res.status}: ${detail.slice(0, 200)}` };
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "tts_failed" };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  try {
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const path = `vo/${crypto.randomUUID()}.mp3`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (error) return { ok: false, error: error.message };
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "upload_failed" };
  }
}
