import { chatJSON } from "./openai";

/** Per-platform norms the drafter tailors to (defaults; brand voice can override). */
export const PLATFORM_RULES: Record<string, string> = {
  instagram:
    "Meme-energy, punchy, short lines, emoji-friendly. End with exactly 5 relevant hashtags.",
  linkedin:
    "~1200–1400 characters. First-person builder story, professional but human, ends on a business lesson. 0–3 hashtags.",
  x: "Punchy hook under 280 characters, or a short thread-starter. 1–2 hashtags max.",
  facebook:
    "Conversational community tone, 1–2 short paragraphs, end with a question to drive comments.",
  tiktok: "Short caption for a short video, trendy tone, 3–5 hashtags.",
  youtube: "Community-post style caption with a curiosity hook.",
  threads: "Casual, conversational, punchy.",
  pinterest: "Descriptive, keyword-rich caption for a pin. 2–4 hashtags.",
  bluesky: "Casual and concise, under 300 characters.",
};

export const PLATFORMS = Object.keys(PLATFORM_RULES);

export interface Draft {
  platform: string;
  text: string;
}

/** Draft one post per platform, tailored, in the given brand voice. */
export async function draftPosts(params: {
  brandVoice: string;
  topic: string;
  platforms: string[];
  insights?: string;
  preferences?: string;
}): Promise<Draft[]> {
  const { brandVoice, topic, platforms, insights, preferences } = params;
  const rules = platforms
    .map((p) => `- ${p}: ${PLATFORM_RULES[p] ?? "platform-appropriate best practice"}`)
    .join("\n");

  const system =
    "You are an expert social media copywriter. Write posts strictly in the user's brand voice, " +
    "tailored to each platform's norms. Never invent facts or claims not supported by the brand voice. " +
    "If the user's learned style preferences are provided, follow them closely — they reflect how this " +
    "specific user edits drafts. " +
    'Return ONLY JSON of the form {"posts":[{"platform":"<name>","text":"<post>"}]}.';

  const learned = insights
    ? `WHAT WE'VE LEARNED FROM REAL CUSTOMERS (ground the posts in this — speak to these pain ` +
      `points/objections and use these angles, in the customers' own words):\n${insights}\n\n`
    : "";

  const prefs = preferences
    ? `HOW THIS USER LIKES DRAFTS (learned from what they approve/edit/reject — match this closely):\n${preferences}\n\n`
    : "";

  const user =
    `BRAND VOICE:\n${brandVoice}\n\n` +
    learned +
    prefs +
    `TOPIC: ${topic}\n\n` +
    `Write one post for each of these platforms, each tailored to its norms:\n${rules}\n\n` +
    `Return JSON with a "posts" array, one entry per requested platform.`;

  const json = (await chatJSON(system, user)) as { posts?: unknown } | null;
  const posts = json?.posts;
  if (!Array.isArray(posts)) return [];
  return posts
    .map((p) => {
      const obj = p as { platform?: unknown; text?: unknown };
      return { platform: String(obj.platform ?? ""), text: String(obj.text ?? "") };
    })
    .filter((p) => p.platform && p.text);
}
