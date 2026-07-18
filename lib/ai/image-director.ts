import { chatJSON } from "./openai";

/**
 * AI art director — the fix for "generic AI look". Instead of sending a ten-word
 * concept to the image model, gpt-5.5 turns the post + the brand's visual
 * identity into a proper treatment: a detailed, art-directed diffusion prompt
 * (photo / illustration), or card copy for a rendered branded graphic (crisp
 * text — diffusion models can't do words).
 */

export type ImageFormat = "photo" | "illustration" | "graphic";

export interface CardContent {
  headline: string;
  sub?: string;
  statValue?: string;
  statLabel?: string;
}

export interface ImageDirection {
  format: ImageFormat;
  /** Detailed diffusion prompt (photo/illustration only). */
  prompt?: string;
  /** Card copy (graphic only). */
  card?: CardContent;
}

export async function directImage(params: {
  brandName: string;
  oneLiner?: string;
  icp?: string;
  visualStyle?: string;
  accentColor?: string;
  postText?: string;
  concept: string;
  /** "auto" lets the director choose; otherwise force a format. */
  requestedFormat?: string;
}): Promise<ImageDirection | null> {
  const {
    brandName,
    oneLiner,
    icp,
    visualStyle,
    accentColor,
    postText,
    concept,
    requestedFormat = "auto",
  } = params;

  const forced = ["photo", "illustration", "graphic"].includes(requestedFormat)
    ? (requestedFormat as ImageFormat)
    : null;

  const system =
    "You are a senior brand art director for social media. Given a post and the brand's visual " +
    "identity, design the image treatment that will stop the scroll AND look like it belongs to " +
    "this brand — never generic AI stock imagery.\n" +
    "Formats:\n" +
    "- \"graphic\": a rendered branded card (best when the post's power is a claim, number or " +
    "question). Write the card copy: headline ≤ 8 punchy words; optional sub ≤ 16 words; optional " +
    "stat (statValue like \"63%\" or \"24/7\" + short statLabel). Copy must come from the post — " +
    "never invent numbers.\n" +
    '- "photo": a photographic scene. Write a rich prompt: specific subject and setting (drawn ' +
    "from the post and the audience's world), composition, lens/depth of field, lighting, time of " +
    "day, colour grading tied to the brand palette, candid documentary mood. State: no text, no " +
    "words, no logos, no watermarks in the image.\n" +
    '- "illustration": a stylised illustration/3D render. Write a rich prompt: subject, one ' +
    "consistent style (e.g. flat vector, isometric 3D, editorial collage), brand palette colours, " +
    "composition, background, mood. State: no text, no words, no logos.\n" +
    (forced
      ? `The user has chosen the format: "${forced}". Use it.\n`
      : "Choose the single best format for THIS post.\n") +
    'Return ONLY JSON: {"format":"photo|illustration|graphic","prompt":"<diffusion prompt, empty ' +
    'for graphic>","card":{"headline":"","sub":"","statValue":"","statLabel":""}}.';

  const user =
    `BRAND: ${brandName}\n` +
    (oneLiner ? `WHAT IT IS: ${oneLiner}\n` : "") +
    (icp ? `AUDIENCE: ${icp}\n` : "") +
    (visualStyle
      ? `VISUAL IDENTITY (follow this): ${visualStyle}\n`
      : `VISUAL IDENTITY: none defined — default to a clean, modern style around accent colour ${accentColor ?? "#2563eb"}.\n`) +
    (accentColor ? `BRAND ACCENT COLOUR: ${accentColor}\n` : "") +
    (postText ? `\nTHE POST THIS IMAGE ACCOMPANIES:\n${postText.slice(0, 1200)}\n` : "") +
    `\nIMAGE CONCEPT: ${concept}\n\nDesign the treatment as JSON.`;

  const json = (await chatJSON(system, user)) as {
    format?: unknown;
    prompt?: unknown;
    card?: { headline?: unknown; sub?: unknown; statValue?: unknown; statLabel?: unknown };
  } | null;
  if (!json) return null;

  const format = forced ?? (["photo", "illustration", "graphic"].includes(String(json.format))
    ? (String(json.format) as ImageFormat)
    : "photo");
  const prompt = typeof json.prompt === "string" ? json.prompt.trim() : "";
  const headline = String(json.card?.headline ?? "").trim();

  if (format === "graphic") {
    if (!headline) return null;
    const card: CardContent = { headline: headline.slice(0, 90) };
    const sub = String(json.card?.sub ?? "").trim();
    const statValue = String(json.card?.statValue ?? "").trim();
    const statLabel = String(json.card?.statLabel ?? "").trim();
    if (sub) card.sub = sub.slice(0, 140);
    if (statValue) {
      card.statValue = statValue.slice(0, 12);
      if (statLabel) card.statLabel = statLabel.slice(0, 60);
    }
    return { format, card };
  }

  if (!prompt) return null;
  return { format, prompt: prompt.slice(0, 2000) };
}
