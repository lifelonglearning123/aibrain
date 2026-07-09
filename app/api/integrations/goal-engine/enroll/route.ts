import { NextResponse } from "next/server";
import { enrollContact } from "@/lib/integrations/goal-engine";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Triggers a Goal Engine enrolment. Requires a signed-in user when Supabase is set up. */
export async function POST(req: Request) {
  // Auth guard (skipped in demo mode when Supabase isn't configured yet).
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as {
    goalId?: string;
    contactId?: string;
  };
  const goalId = (body.goalId ?? "").trim();
  const contactId = (body.contactId ?? "").trim();

  if (!goalId || !contactId) {
    return NextResponse.json(
      { ok: false, status: 400, error: "goalId_and_contactId_required" },
      { status: 400 },
    );
  }

  const result = await enrollContact({ goalId, contactId });
  return NextResponse.json(result, {
    status: result.ok ? 200 : result.status || 400,
  });
}
