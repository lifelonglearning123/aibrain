import { NextResponse } from "next/server";
import { exchangeCode, fetchTenantId, storeTokens } from "@/lib/integrations/xero";
import { resolveEntity, ALL } from "@/lib/entities";

/** OAuth redirect target: exchanges the code, resolves the tenant, stores tokens. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const entity = resolveEntity(searchParams.get("state"));

  const back = (status: string) =>
    NextResponse.redirect(`${origin}/dashboard/apps?xero=${status}`);

  if (!code || entity === ALL) return back("error");

  const tokens = await exchangeCode(code);
  if (!tokens) return back("exchange_failed");

  const tenantId = await fetchTenantId(tokens.access_token);
  if (!tenantId) return back("no_organisation");

  const stored = await storeTokens(entity, tenantId, tokens);
  return back(stored ? "connected" : "store_failed");
}
