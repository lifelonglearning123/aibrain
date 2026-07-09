import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/ask";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { ENTITIES } from "@/lib/entities";

export const maxDuration = 60;

/** Ask-your-data: answers a question from the brief + learned knowledge. */
export async function POST(req: Request) {
  const configured = supabaseConfig().configured;
  const access = configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    history?: { role: string; content: string }[];
  };
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ ok: false, error: "question_required" }, { status: 400 });

  // Demo mode (no Supabase) → full portfolio. Otherwise scope to the user's access.
  const brands = access ? access.brands : ENTITIES.map((e) => e.key);
  const isOwner = access ? access.isOwner : true;

  const result = await answerQuestion({ question, history: body.history, brands, isOwner });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
