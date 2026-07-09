import { NextResponse } from "next/server";
import { exchangeCode, storeTokens } from "@/lib/integrations/quickbooks";
import { resolveEntity, ALL } from "@/lib/entities";

/** OAuth redirect target: exchanges the code for tokens and stores them per brand. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const entity = resolveEntity(searchParams.get("state"));

  const back = (status: string) =>
    NextResponse.redirect(`${origin}/dashboard/apps?quickbooks=${status}`);

  if (!code || !realmId || entity === ALL) return back("error");

  const tokens = await exchangeCode(code);
  if (!tokens) return back("exchange_failed");

  const stored = await storeTokens(entity, realmId, tokens);
  return back(stored ? "connected" : "store_failed");
}
