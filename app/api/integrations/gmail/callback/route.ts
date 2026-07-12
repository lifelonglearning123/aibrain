import { NextResponse } from "next/server";
import { exchangeCode, storeTokens } from "@/lib/integrations/gmail";

/** OAuth redirect target: exchanges the code for tokens and stores them. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  const back = (status: string) =>
    NextResponse.redirect(`${origin}/dashboard/apps?gmail=${status}`);

  if (!code) return back("error");

  const tokens = await exchangeCode(code);
  if (!tokens) return back("exchange_failed");
  if (!tokens.refresh_token) {
    // No refresh token → unattended sync would break. Usually means the app
    // wasn't sent prompt=consent, or the account already granted before.
    return back("no_refresh_token");
  }

  const stored = await storeTokens(tokens);
  return back(stored ? "connected" : "store_failed");
}
