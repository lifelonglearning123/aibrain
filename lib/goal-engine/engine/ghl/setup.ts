import { type LocationCtx, listTags, createTag } from "@/lib/goal-engine/engine/ghl/client";

/**
 * One-time GHL provisioning for a location (ported from the FB-retargeting
 * setup). In Goal Engine most state lives in Supabase, so we only need a couple
 * of tags the router uses. Idempotent — creates only what's missing.
 */
const REQUIRED_TAGS = ["ai-handoff", "ai-opted-out"];

export async function provisionLocation(ctx: LocationCtx): Promise<{ created: string[]; existing: string[] }> {
  const have = (await listTags(ctx)).map((t) => (t.name ?? "").toLowerCase());
  const created: string[] = [];
  const existing: string[] = [];
  for (const tag of REQUIRED_TAGS) {
    if (have.includes(tag)) existing.push(tag);
    else {
      await createTag(ctx, tag);
      created.push(tag);
    }
  }
  return { created, existing };
}

/** Cheap connectivity check — a valid token can list the location's tags. */
export async function verifyToken(ctx: LocationCtx): Promise<boolean> {
  try {
    await listTags(ctx);
    return true;
  } catch {
    return false;
  }
}
