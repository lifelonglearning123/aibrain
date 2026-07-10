import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/integrations/xero";
import { resolveEntity, ALL } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

/** Starts the Xero OAuth flow for a brand: GET ?entity=<key> → Xero consent. */
export async function GET(req: Request) {
  // Owner-only when Supabase is set up: connecting accounting is portfolio config.
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.hasAccess) return NextResponse.redirect(new URL("/login", req.url));
    if (!access.isOwner) return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const entityParam = new URL(req.url).searchParams.get("entity");
  const entity = resolveEntity(entityParam);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "specify ?entity=<brand>" }, { status: 400 });
  }

  const url = await authorizeUrl(entity);
  if (!url) {
    return NextResponse.json({ ok: false, error: "xero_not_configured" }, { status: 400 });
  }
  return NextResponse.redirect(url);
}
