import { NextResponse } from "next/server";
import { synthesizeSpeech, TTS_VOICES, type TtsVoice } from "@/lib/ai/tts";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// TTS + upload is quick, but give it headroom for longer scripts.
export const maxDuration = 60;

/** Synthesize a voiceover MP3 and return a public URL for the render. */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "text_required" }, { status: 400 });
  }
  const voice = TTS_VOICES.includes(body.voice as TtsVoice)
    ? (body.voice as TtsVoice)
    : undefined;

  const result = await synthesizeSpeech(text, voice);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
