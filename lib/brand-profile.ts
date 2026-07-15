import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { influenceStyleBlock } from "@/lib/voice-influences";

/**
 * Business Context — the durable, human-authored profile of each business (offer,
 * ICP, pricing, revenue model, positioning, voice, priorities). This is the "Context"
 * C of the 4 C's: it's what makes the brain answer like a teammate, not a stranger.
 * Stored per-brand in brand_knowledge (kind='profile', one JSON row per brand — no
 * migration), and injected into Ask, the brief, sequence drafting + the knowledge API.
 */

export interface BrandProfile {
  oneLiner?: string;
  offer?: string;
  icp?: string;
  pricing?: string;
  revenueModel?: string;
  differentiators?: string;
  voiceTone?: string;
  voiceSamples?: string;
  priorities?: string;
  constraints?: string;
  notes?: string;
  /** Selected well-known entrepreneur voice influences (keys from voice-influences.ts). */
  voiceInfluences?: string[];
  /** A custom voice reference (a named person + description, or pasted style notes). */
  customVoice?: string;
}

/** The free-text profile fields (everything except the structured voiceInfluences list). */
export type ProfileTextKey = Exclude<keyof BrandProfile, "voiceInfluences">;

export interface ProfileField {
  key: ProfileTextKey;
  label: string;
  hint: string;
  group: string;
  rows: number;
}

/** Field metadata drives the form — edit here to change what's captured. */
export const PROFILE_FIELDS: ProfileField[] = [
  { key: "oneLiner", group: "Identity", label: "In one line: who you are, what you sell, to whom", hint: "e.g. \"We build white-label AI voice receptionists for UK trades businesses.\"", rows: 2 },
  { key: "offer", group: "Identity", label: "Your core offer(s) and packages", hint: "What you actually sell, and the main packages/tiers.", rows: 3 },
  { key: "icp", group: "Identity", label: "Ideal customer (ICP)", hint: "Who this is for — industry, size, the pain they have.", rows: 3 },
  { key: "pricing", group: "Identity", label: "Pricing", hint: "Price points / packages (e.g. £99/mo, £1k setup).", rows: 2 },
  { key: "revenueModel", group: "Identity", label: "Revenue model", hint: "How money comes in — subscription / one-off / retainer / rev-share / funded.", rows: 2 },
  { key: "differentiators", group: "Positioning", label: "What makes you different", hint: "Why customers choose you over the alternatives; your proof/mechanism.", rows: 3 },
  { key: "voiceTone", group: "Voice", label: "Your tone of voice", hint: "e.g. direct, warm, no jargon, British spelling, short sentences.", rows: 2 },
  { key: "voiceSamples", group: "Voice", label: "Paste 1–2 things you've written (verbatim)", hint: "A real post or client email — so drafts sound like YOU, not generic AI. Don't edit them.", rows: 6 },
  { key: "priorities", group: "Priorities", label: "Top 2–3 priorities right now", hint: "What matters most this quarter, and why.", rows: 3 },
  { key: "constraints", group: "Priorities", label: "What would break first if you 10×'d?", hint: "The bottleneck — helps the brain spot the real constraint.", rows: 2 },
  { key: "notes", group: "Other", label: "Anything else the brain should know", hint: "Context that doesn't fit above.", rows: 3 },
];

export const PROFILE_GROUPS = [...new Set(PROFILE_FIELDS.map((f) => f.group))];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getBrandProfile(entity: EntityKey): Promise<BrandProfile | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("brand_knowledge")
    .select("text")
    .eq("kind", "profile")
    .eq("entity_key", entity)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!data?.text) return null;
  try {
    return JSON.parse(String(data.text)) as BrandProfile;
  } catch {
    return null;
  }
}

/** Profiles for several brands at once (for the form + Ask). */
export async function getBrandProfiles(
  brands: EntityKey[],
): Promise<Record<string, BrandProfile>> {
  const out: Record<string, BrandProfile> = {};
  const admin = createAdminClient();
  if (!admin || brands.length === 0) return out;
  const { data } = await admin
    .from("brand_knowledge")
    .select("entity_key,text")
    .eq("kind", "profile")
    .eq("status", "active")
    .in("entity_key", brands);
  for (const r of (data as any[]) ?? []) {
    try {
      out[r.entity_key as string] = JSON.parse(String(r.text)) as BrandProfile;
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Upsert a brand's profile (one row per brand). */
export async function saveBrandProfile(
  entity: EntityKey,
  profile: BrandProfile,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  // Keep exactly one profile row per brand.
  await admin.from("brand_knowledge").delete().eq("kind", "profile").eq("entity_key", entity);
  const { error } = await admin.from("brand_knowledge").insert({
    scope: "brand",
    entity_key: entity,
    kind: "profile",
    text: JSON.stringify(profile),
    converts: false,
    source: "profile",
    status: "active",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Format a profile as a prompt block (voice samples excluded — see voiceBlock). */
export function profilePrompt(profile: BrandProfile | null | undefined, brandName?: string): string {
  if (!profile) return "";
  const lines: string[] = [];
  const add = (label: string, v?: string) => {
    if (v && v.trim()) lines.push(`- ${label}: ${v.trim()}`);
  };
  add("What it is", profile.oneLiner);
  add("Offer", profile.offer);
  add("Ideal customer", profile.icp);
  add("Pricing", profile.pricing);
  add("Revenue model", profile.revenueModel);
  add("Differentiators", profile.differentiators);
  add("Tone of voice", profile.voiceTone);
  add("Current priorities", profile.priorities);
  add("Key constraint", profile.constraints);
  add("Other", profile.notes);
  if (!lines.length) return "";
  return `BUSINESS CONTEXT${brandName ? ` — ${brandName}` : ""} (author: the owner; treat as ground truth):\n${lines.join("\n")}`;
}

/** The owner's real writing samples + chosen influences, for grounding drafts. */
export function voiceBlock(profile: BrandProfile | null | undefined): string {
  const s = profile?.voiceSamples?.trim();
  const tone = profile?.voiceTone?.trim();
  const influences = influenceStyleBlock(profile?.voiceInfluences, profile?.customVoice);
  if (!s && !tone && !influences) return "";
  return [
    tone ? `Tone: ${tone}` : "",
    s ? `Write in this brand's own voice — samples of their real writing:\n${s.slice(0, 2000)}` : "",
    influences,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function brandName(entity: EntityKey): string {
  return ENTITIES.find((e) => e.key === entity)?.name ?? entity;
}
