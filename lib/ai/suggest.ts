import { chatJSON } from "./openai";
import { PLATFORMS } from "./draft";

/**
 * Post suggestions — the brain proposes what to post next, grounded in the
 * brand's Business Context profile and learned customer evidence (pain points,
 * objections, winning angles). The user only approves or edits — the "default
 * shift" applied to social: AI does the thinking, the human does the judging.
 */

export interface PostSuggestion {
  topic: string;
  why: string;
  platforms: string[];
  imagePrompt: string;
}

export async function suggestPosts(params: {
  brandName: string;
  context?: string;
  voice?: string;
  insights?: string;
  performance?: string;
  benefits?: string;
  recentPosts?: string[];
  count?: number;
}): Promise<PostSuggestion[]> {
  const { brandName, context, voice, insights, performance, benefits, recentPosts, count = 5 } = params;

  const system =
    "You are the social media strategist for this business. Propose specific, ready-to-draft " +
    "post ideas grounded ONLY in the business context, verified facts and learned customer evidence " +
    "provided — never invent products, claims or numbers.\n\n" +
    "BE VALUE-LED, NOT SALESY: most ideas (aim ~80%) should GIVE the audience value — a useful " +
    "insight, tip, how-to, myth-buster, or benefit backed by a verified fact — NOT pitch the product. " +
    "Only a minority (~20%) should be direct offers/CTAs. Each idea must be concrete enough to draft " +
    "from directly (a specific angle, not a vague theme). When real post performance is provided, " +
    "weight it: propose more of what earned engagement, avoid what flopped, and say so in \"why\". " +
    'Return ONLY JSON of the form {"suggestions":[{"topic":"<one-line post idea>",' +
    '"why":"<one sentence: which evidence/fact/performance this is grounded in and why it will land>",' +
    '"platforms":["<best-fit platforms>"],"imagePrompt":"<short visual concept for an image>"}]}.';

  const recent = recentPosts?.length
    ? `RECENTLY POSTED (don't repeat these topics or angles):\n${recentPosts
        .map((p) => `- ${p}`)
        .join("\n")}\n\n`
    : "";

  const user =
    `BUSINESS: ${brandName}\n\n` +
    (context ? `${context}\n\n` : "") +
    (benefits ? `${benefits}\n\n` : "") +
    (insights ? `WHAT WE'VE LEARNED FROM REAL CUSTOMERS:\n${insights}\n\n` : "") +
    (performance ? `${performance}\n\n` : "") +
    (voice ? `BRAND VOICE (flavour the ideas to suit it):\n${voice}\n\n` : "") +
    recent +
    `Supported platforms: ${PLATFORMS.join(", ")}.\n\n` +
    `Propose ${count} post ideas as JSON with a "suggestions" array. Lead with value/benefit ideas ` +
    `(teach, tips, myth-busters, benefit + verified fact); include at most one direct-offer idea.`;

  const json = (await chatJSON(system, user)) as { suggestions?: unknown } | null;
  const suggestions = json?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .map((s) => {
      const obj = s as {
        topic?: unknown;
        why?: unknown;
        platforms?: unknown;
        imagePrompt?: unknown;
      };
      const platforms = Array.isArray(obj.platforms)
        ? obj.platforms.map((p) => String(p).toLowerCase()).filter((p) => PLATFORMS.includes(p))
        : [];
      return {
        topic: String(obj.topic ?? "").trim(),
        why: String(obj.why ?? "").trim(),
        platforms,
        imagePrompt: String(obj.imagePrompt ?? "").trim(),
      };
    })
    .filter((s) => s.topic)
    .slice(0, count);
}
