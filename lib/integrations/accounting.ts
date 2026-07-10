import { type EntityKey } from "@/lib/entities";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  quickbooksConfig,
  getBrandFinancials as qbFinancials,
  type BrandFinancials,
} from "@/lib/integrations/quickbooks";
import { xeroConfig, getBrandFinancials as xeroFinancials } from "@/lib/integrations/xero";

/**
 * Accounting router — each brand can use a different accounting tool. macaws /
 * Leonardo on QuickBooks, Artificial Ignorance on Xero, etc. Revenue + Brief call
 * getBrandFinancials() here and we route to whichever provider the brand has
 * actually connected (a stored OAuth token wins).
 */

export type { BrandFinancials };

export async function accountingConfig() {
  const [qb, xero] = await Promise.all([quickbooksConfig(), xeroConfig()]);
  return {
    qb: qb.configured,
    xero: xero.configured,
    anyConfigured: qb.configured || xero.configured,
  };
}

/** Which provider a brand has a stored connection for (Xero preferred if both). */
async function providerFor(entity: EntityKey): Promise<"xero" | "quickbooks" | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("oauth_connections")
    .select("provider")
    .eq("entity_key", entity)
    .in("provider", ["xero", "quickbooks"]);
  const providers = (data ?? []).map((r) => r.provider as string);
  if (providers.includes("xero")) return "xero";
  if (providers.includes("quickbooks")) return "quickbooks";
  return null;
}

/** Financials for a brand from whichever accounting tool it's connected to. */
export async function getBrandFinancials(entity: EntityKey): Promise<BrandFinancials> {
  const provider = await providerFor(entity);
  if (provider === "xero") return xeroFinancials(entity);
  if (provider === "quickbooks") return qbFinancials(entity);
  // Not connected to either → return QB's not_connected/not_configured shape.
  return qbFinancials(entity);
}
