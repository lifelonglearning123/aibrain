import { NextResponse } from "next/server";
import { checkRender, shotstackConfig } from "@/lib/integrations/shotstack";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Polls a Shotstack render's status for the client. */
export async function GET(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  if (!(await shotstackConfig()).configured) {
    return NextResponse.json({ status: "error", error: "shotstack_not_configured" }, { status: 400 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ status: "error", error: "id_required" }, { status: 400 });

  const result = await checkRender(id);
  return NextResponse.json(result);
}
