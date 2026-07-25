import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/goal-engine/engine/supabase/server";
import { db } from "@/lib/goal-engine/engine/db/server";

export interface TenantCtx {
  userId: string;
  tenantId: string;
  email: string;
}

/**
 * Resolve the logged-in user's tenant (redirect to sign-in if not authed).
 * On first login the user has no tenant — we bootstrap one and make them owner.
 */
export async function requireTenant(): Promise<TenantCtx> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Deterministic: resolve to the user's OLDEST membership. Never use
  // maybeSingle() here — it errors on 2+ rows, which would spawn duplicate
  // tenants on every load. Converge to the oldest so races self-heal.
  const oldest = await firstTenantId(user.id);
  if (oldest) return { userId: user.id, tenantId: oldest, email: user.email ?? "" };

  const { data: tenant, error: tErr } = await db()
    .from("tenants")
    .insert({ name: user.email ?? "Agency" })
    .select("id")
    .single();
  if (tErr || !tenant) {
    throw new Error(`Could not create tenant — did the migration run? (${tErr?.message ?? "no row returned"})`);
  }
  const { error: mErr } = await db()
    .from("tenant_members")
    .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner" });
  if (mErr) throw new Error(`Could not create membership: ${mErr.message}`);

  // Re-resolve to the oldest in case a concurrent request also bootstrapped.
  const tenantId = (await firstTenantId(user.id)) ?? (tenant.id as string);
  return { userId: user.id, tenantId, email: user.email ?? "" };
}

async function firstTenantId(userId: string): Promise<string | null> {
  const { data } = await db()
    .from("tenant_members")
    .select("tenant_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("tenant_id", { ascending: true })
    .limit(1);
  return (data?.[0]?.tenant_id as string) ?? null;
}
