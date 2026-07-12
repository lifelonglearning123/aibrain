import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/integrations/gmail";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** Starts the Gmail OAuth flow (read-only). Owner-only. */
export async function GET(req: Request) {
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.hasAccess) return NextResponse.redirect(new URL("/login", req.url));
    if (!access.isOwner) return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const url = await authorizeUrl();
  if (!url) {
    return NextResponse.json({ ok: false, error: "gmail_not_configured" }, { status: 400 });
  }
  return NextResponse.redirect(url);
}
