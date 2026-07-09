import { ENTITIES, ALL, type EntityKey, type EntityFilter } from "@/lib/entities";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cred } from "@/lib/credentials";

/**
 * Per-company access control.
 * - Owners (OWNER_EMAILS, or a memberships row with role=owner) see every brand.
 * - Partners see only the brands in their memberships row.
 * - Bootstrap safety: if NO owner email is set AND there are NO memberships, access
 *   control is "unconfigured" and every signed-in user is treated as an owner — so
 *   nothing breaks until you set it up.
 */

const ALL_BRANDS = ENTITIES.map((e) => e.key);

export interface Access {
  email: string | null;
  role: "owner" | "partner";
  brands: EntityKey[];
  isOwner: boolean;
  hasAccess: boolean;
  unconfigured: boolean;
  /** True when the user is signed in, has no access, AND no owner exists anywhere
   *  yet — so they can safely claim the master owner account (lockout recovery). */
  canClaim: boolean;
}

export async function getAccess(): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;

  const ownersRaw = (await cred("OWNER_EMAILS")) ?? "";
  const owners = ownersRaw
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const admin = createAdminClient();
  let anyMemberships = false;
  let ownerMembershipExists = false;
  let row: { role?: string; brands?: string[] } | null = null;
  if (admin) {
    // memberships is tiny (a few teammates) — one fetch covers all three checks.
    const { data: all } = await admin.from("memberships").select("email,role,brands");
    const rows = all ?? [];
    anyMemberships = rows.length > 0;
    ownerMembershipExists = rows.some((r) => r.role === "owner");
    if (email) row = rows.find((r) => r.email === email) ?? null;
  }

  // Does the system have ANY owner yet? If not, a locked-out user may claim it.
  const ownerExists = owners.length > 0 || ownerMembershipExists;

  // Not configured yet → everyone signed-in is an owner (backward compatible).
  if (owners.length === 0 && !anyMemberships) {
    return {
      email,
      role: "owner",
      brands: ALL_BRANDS,
      isOwner: true,
      hasAccess: Boolean(email),
      unconfigured: true,
      canClaim: false,
    };
  }

  if (email && owners.includes(email)) {
    return {
      email,
      role: "owner",
      brands: ALL_BRANDS,
      isOwner: true,
      hasAccess: true,
      unconfigured: false,
      canClaim: false,
    };
  }

  if (row) {
    const isOwner = row.role === "owner";
    const brands = isOwner
      ? ALL_BRANDS
      : (row.brands ?? []).filter((b): b is EntityKey => ALL_BRANDS.includes(b as EntityKey));
    return {
      email,
      role: isOwner ? "owner" : "partner",
      brands,
      isOwner,
      hasAccess: brands.length > 0,
      unconfigured: false,
      canClaim: false,
    };
  }

  // Signed in but not invited. Offer to claim ownership only if the system has
  // no owner at all yet (recovers the "invited a partner before setting an owner" trap).
  return {
    email,
    role: "partner",
    brands: [],
    isOwner: false,
    hasAccess: false,
    unconfigured: false,
    canClaim: Boolean(email) && !ownerExists,
  };
}

/**
 * Authoritative check used by the claim-owner route: is there any owner in the
 * system yet? (OWNER_EMAILS set, or a membership with role=owner.)
 */
export async function systemHasOwner(): Promise<boolean> {
  const ownersRaw = (await cred("OWNER_EMAILS")) ?? "";
  const owners = ownersRaw
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (owners.length > 0) return true;
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("memberships").select("email").eq("role", "owner").limit(1);
  return (data?.length ?? 0) > 0;
}

/** Entities to actually show/act on: (allowed brands) ∩ (configured) ∩ (requested filter). */
export async function scopeEntities(
  requested: EntityFilter,
  configured: EntityKey[],
  access?: Access,
): Promise<EntityKey[]> {
  const a = access ?? (await getAccess());
  const allowed = configured.filter((e) => a.brands.includes(e));
  if (requested === ALL) return allowed;
  return allowed.includes(requested as EntityKey) ? [requested as EntityKey] : [];
}

/** Is a specific brand allowed for the current user? (for API route guards) */
export async function canAccessBrand(entity: string, access?: Access): Promise<boolean> {
  const a = access ?? (await getAccess());
  return a.brands.includes(entity as EntityKey);
}
