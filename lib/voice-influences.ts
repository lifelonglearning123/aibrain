/**
 * Voice influences — well-known entrepreneur/marketer communication styles a brand
 * can "borrow" as a secondary flavour in drafting (sequences, social, copy). This is
 * style guidance, not impersonation: we describe HOW they communicate so the brand's
 * own voice leads and the influence seasons it. Selected per brand in Business Context.
 */

export interface VoiceInfluence {
  key: string;
  name: string;
  tagline: string;
  /** The injectable style description used in drafting prompts. */
  style: string;
}

export const VOICE_INFLUENCES: VoiceInfluence[] = [
  {
    key: "hormozi",
    name: "Alex Hormozi",
    tagline: "Value-dense, no fluff",
    style:
      "Blunt and direct. Lead with a concrete promise, stack specific value, and remove risk. Short punchy sentences, real numbers and simple frameworks, contrarian hooks ('most people get this wrong'). Proof over adjectives — no hype words.",
  },
  {
    key: "garyvee",
    name: "Gary Vaynerchuk",
    tagline: "High-energy, empathetic hustle",
    style:
      "Conversational and urgent, like a message to a friend. Blunt truths wrapped in encouragement. Short lines, real talk, bias to action ('do the work'). Warm but no-nonsense.",
  },
  {
    key: "naval",
    name: "Naval Ravikant",
    tagline: "Calm, aphoristic, first-principles",
    style:
      "Concise, timeless one-liners. Philosophical and clear; say more with fewer words. First-principles reasoning. No urgency, no hype — signal over noise.",
  },
  {
    key: "jobs",
    name: "Steve Jobs",
    tagline: "Simple, visionary, benefit-first",
    style:
      "Radically simple. Lead with the benefit and the feeling, not the spec. 'It just works.' Strip jargon. Confident, minimalist, a little magical.",
  },
  {
    key: "godin",
    name: "Seth Godin",
    tagline: "Short, thoughtful, provocative",
    style:
      "Very short paragraphs. Open with a small story or a sharp question. Ideas over pitches. Generous and human — make one point, make it well.",
  },
  {
    key: "priestley",
    name: "Daniel Priestley",
    tagline: "Positioning & ascending offers (British)",
    style:
      "British, credible, strategic. Frame status and scarcity, build an ascending ladder of offers, 'key person of influence' positioning. Calm authority, no gimmicks.",
  },
  {
    key: "ogilvy",
    name: "David Ogilvy",
    tagline: "Classic direct-response",
    style:
      "Clear, factual, persuasive long-copy that respects the reader. A strong specific headline, concrete benefits and proof. 'The consumer isn't a moron.' Elegant, never gimmicky.",
  },
  {
    key: "branson",
    name: "Richard Branson",
    tagline: "Warm, adventurous, people-first",
    style:
      "Friendly and optimistic. People and stories first, product second. Playful and human, championing the customer and the team.",
  },
];

export function voiceInfluenceByKey(key: string): VoiceInfluence | undefined {
  return VOICE_INFLUENCES.find((v) => v.key === key);
}

/** Render selected influences (+ optional custom voice) as a drafting style block. */
export function influenceStyleBlock(keys?: string[], custom?: string): string {
  const chosen = (keys ?? []).map(voiceInfluenceByKey).filter(Boolean) as VoiceInfluence[];
  const c = custom?.trim();
  if (chosen.length === 0 && !c) return "";
  const lines = [
    "STYLE INFLUENCES — blend these in as flavour, but keep the brand's OWN voice in charge:",
    ...chosen.map((v) => `- ${v.name}: ${v.style}`),
    c ? `- Custom reference: ${c}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
