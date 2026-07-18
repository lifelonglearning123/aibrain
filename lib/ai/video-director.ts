import { chatJSON } from "./openai";

/**
 * AI video director — the fix for "generic AI look" in video, mirroring
 * image-director for the text→image→animate pipeline. gpt-5.5 turns the post +
 * the brand's visual identity into TWO prompts:
 *  - stillPrompt: an art-directed first frame (brand palette, real audience
 *    world, "no text/logos") — fed to Higgsfield text2image.
 *  - motionPrompt: the "subtle living motion" recipe the ad-creative/video
 *    skills prescribe — one literal motion tied to the concept, composition
 *    held fixed, and the hard-won gotchas baked in (never mention hands; no
 *    camera whip / scene change / morphing / added text).
 * The still and the motion are deliberately separate so the animate step keeps
 * the frame stable instead of reinventing it.
 */

export interface VideoDirection {
  stillPrompt: string;
  motionPrompt: string;
  /** One-line note on the shot, for the UI. */
  concept: string;
}

export async function directVideo(params: {
  brandName: string;
  oneLiner?: string;
  icp?: string;
  visualStyle?: string;
  accentColor?: string;
  postText?: string;
  concept: string;
}): Promise<VideoDirection | null> {
  const { brandName, oneLiner, icp, visualStyle, accentColor, postText, concept } = params;

  const system =
    "You are a senior brand video director for short-form social video. You design ONE beat of an " +
    "AI-generated clip made by animating a still image. Given a post and the brand's visual " +
    "identity, produce two things:\n" +
    "1) stillPrompt — a rich prompt for the FIRST FRAME (a photographic or illustrated scene, drawn " +
    "from the post and the audience's real world): specific subject + setting, composition, lens/" +
    "depth of field, lighting, colour grading tied to the brand palette. It must belong to THIS " +
    "brand, never generic AI stock. State explicitly: no text, no words, no logos, no watermarks.\n" +
    "2) motionPrompt — subtle, believable motion of the elements already in that frame. Use this " +
    "shape: \"Subtle living motion of the existing elements only. <ONE literal motion tied to the " +
    "concept>. <secondary ambient motion: gentle drift or a slow push-in>. The composition stays " +
    "exactly as it is. No camera whip, no scene change, no morphing, no added text.\" " +
    "CRITICAL: never mention hands or people's hands in either prompt (video models hallucinate " +
    "distorted hands, and naming them makes it worse). One dominant motion only.\n" +
    'Return ONLY JSON: {"stillPrompt":"...","motionPrompt":"...","concept":"<≤8-word shot label>"}.';

  const user =
    `BRAND: ${brandName}\n` +
    (oneLiner ? `WHAT IT IS: ${oneLiner}\n` : "") +
    (icp ? `AUDIENCE: ${icp}\n` : "") +
    (visualStyle
      ? `VISUAL IDENTITY (follow this): ${visualStyle}\n`
      : `VISUAL IDENTITY: none defined — default to a clean, modern look around accent colour ${accentColor ?? "#2563eb"}.\n`) +
    (accentColor ? `BRAND ACCENT COLOUR: ${accentColor}\n` : "") +
    (postText ? `\nTHE POST THIS CLIP ACCOMPANIES:\n${postText.slice(0, 1200)}\n` : "") +
    `\nSHOT CONCEPT: ${concept}\n\nDesign the beat as JSON.`;

  const json = (await chatJSON(system, user)) as {
    stillPrompt?: unknown;
    motionPrompt?: unknown;
    concept?: unknown;
  } | null;
  if (!json) return null;

  const stillPrompt = String(json.stillPrompt ?? "").trim();
  const motionPrompt = String(json.motionPrompt ?? "").trim();
  if (!stillPrompt || !motionPrompt) return null;

  return {
    stillPrompt: stillPrompt.slice(0, 2000),
    motionPrompt: motionPrompt.slice(0, 1000),
    concept: String(json.concept ?? concept).trim().slice(0, 80),
  };
}
