import { NextResponse } from "next/server";
import { generateImage, higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Image generation is async; allow a longer function timeout (needs Vercel Pro).
export const maxDuration = 120;

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

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    aspect?: string;
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 });
  }

  const result = await generateImage({ prompt, aspect: body.aspect ?? "1:1" });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
