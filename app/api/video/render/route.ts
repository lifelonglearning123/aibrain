import { NextResponse } from "next/server";
import { submitRender, shotstackConfig } from "@/lib/integrations/shotstack";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Submit a Shotstack render of ordered clips; returns a render id to poll. */
export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await shotstackConfig()).configured) {
    return NextResponse.json({ ok: false, error: "shotstack_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    clips?: { url: string }[];
    aspect?: string;
  };
  const clips = (Array.isArray(body.clips) ? body.clips : []).filter(
    (c) => c && typeof c.url === "string" && c.url.startsWith("http"),
  );
  if (clips.length === 0) {
    return NextResponse.json({ ok: false, error: "no_clips" }, { status: 400 });
  }

  const result = await submitRender(clips, body.aspect ?? "9:16");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
