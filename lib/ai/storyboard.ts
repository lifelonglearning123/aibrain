import { chatJSON } from "./openai";

/**
 * Narration-driven storyboard — the fix for "too short" and "no voice" at once.
 * From a topic + brand, gpt-5.5 writes a short spoken script and splits it into
 * beats. Each beat becomes a video scene (its shotConcept feeds the video
 * director) AND a line of the voiceover. N beats → a longer, voiced video whose
 * length follows the narration.
 */

export interface Beat {
  /** One spoken line (~3–4s read aloud). */
  vo: string;
  /** A concrete shot to art-direct + animate for this line. */
  shotConcept: string;
}

export interface Storyboard {
  beats: Beat[];
  /** The full narration, beats joined — used for one continuous voiceover. */
  script: string;
}

/** ~4s of speech per beat; derive a beat count from the target length. */
function beatCountFor(seconds: number): number {
  return Math.min(10, Math.max(3, Math.round(seconds / 4)));
}

export async function generateStoryboard(params: {
  brandName: string;
  topic: string;
  context?: string;
  voice?: string;
  insights?: string;
  targetSeconds?: number;
}): Promise<Storyboard | null> {
  const { brandName, topic, context, voice, insights, targetSeconds = 24 } = params;
  const beats = beatCountFor(targetSeconds);

  const system =
    "You are a short-form video scriptwriter and director for a brand. Write a spoken voiceover " +
    "for a vertical social video and split it into beats. Each beat is ONE punchy spoken line " +
    "(about 3–4 seconds read aloud, ~8–16 words) plus a concrete visual shot that illustrates that " +
    "line. Open with a scroll-stopping hook; end with a clear call to action. Ground everything in " +
    "the brand context and evidence provided — never invent products, claims or numbers. Write in " +
    "British English, plain and confident, no hype or jargon. Each shotConcept must be a real, " +
    "filmable scene from the audience's world (no on-screen text — the words are spoken).\n" +
    `Return ONLY JSON: {"beats":[{"vo":"<spoken line>","shotConcept":"<visual>"}]} with exactly ${beats} beats.`;

  const user =
    `BRAND: ${brandName}\n` +
    (context ? `${context}\n` : "") +
    (insights ? `WHAT WE'VE LEARNED FROM REAL CUSTOMERS:\n${insights}\n` : "") +
    (voice ? `BRAND VOICE:\n${voice}\n` : "") +
    `\nVIDEO TOPIC: ${topic}\n\n` +
    `Write the ${beats}-beat voiceover script as JSON.`;

  const json = (await chatJSON(system, user)) as { beats?: unknown } | null;
  const raw = json?.beats;
  if (!Array.isArray(raw)) return null;
  const parsed: Beat[] = raw
    .map((b) => {
      const obj = b as { vo?: unknown; shotConcept?: unknown };
      return {
        vo: String(obj.vo ?? "").trim(),
        shotConcept: String(obj.shotConcept ?? "").trim(),
      };
    })
    .filter((b) => b.vo && b.shotConcept)
    .slice(0, beats);
  if (parsed.length === 0) return null;
  return { beats: parsed, script: parsed.map((b) => b.vo).join(" ") };
}
