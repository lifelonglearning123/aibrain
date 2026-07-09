import { NextResponse } from "next/server";
import { submitVideo, higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Generates an image from the prompt, then animates it — allow extra time.
export const maxDuration = 300;

/** Submit an AI video clip generation; returns a job id to poll (or an immediate url). */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await higgsfieldConfig()).configured) {
    return NextResponse.json({ ok: false, error: "higgsfield_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; aspect?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 });
  }

  const result = await submitVideo({ prompt, aspect: body.aspect ?? "9:16" });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
