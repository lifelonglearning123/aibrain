import { NextResponse } from "next/server";
import { interviewStep, type InterviewTurn } from "@/lib/ai/brand-voice";
import { openaiConfig } from "@/lib/ai/openai";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await openaiConfig()).configured) {
    return NextResponse.json({ ok: false, error: "openai_not_configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    brandName?: string;
    history?: InterviewTurn[];
  };
  const brandName = (body.brandName ?? "your brand").trim();
  const history = Array.isArray(body.history) ? body.history : [];

  try {
    const result = await interviewStep({ brandName, history });
    if (!result) return NextResponse.json({ ok: false, error: "no_result" }, { status: 502 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "interview_failed" },
      { status: 500 },
    );
  }
}
