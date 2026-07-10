import { NextResponse } from "next/server";
import { checkGeneration, higgsfieldConfig } from "@/lib/integrations/higgsfield";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Polls a Higgsfield image generation's status for the browser. */
export async function GET(req: Request) {
  if (supabaseConfig().configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 401 });
  }

  if (!(await higgsfieldConfig()).configured) {
    return NextResponse.json({ status: "error", error: "higgsfield_not_configured" }, { status: 400 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ status: "error", error: "id_required" }, { status: 400 });

  const result = await checkGeneration(id);
  return NextResponse.json(result);
}
