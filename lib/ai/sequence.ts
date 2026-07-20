import { chatJSON } from "./openai";

/**
 * Drafts a 30-day, benefit-led retargeting campaign (for Goal Engine), grounded
 * in what the brain has learned. Value-first, not sell-sell-sell: ~80% of steps
 * TEACH (kind:"value") using verified benefit facts + real customer language,
 * ~20% make a low-pressure, value-wrapped offer (kind:"sales").
 * Frameworks distilled from the marketing skills:
 *   - emails: value-before-ask, one job per step, nurture cadence, one CTA.
 *   - ads (retargeting): vary the angle; value-first alternatives; verbatim
 *     objections handled as value; proof.
 *   - copywriting: problem-recognition openers, benefit-over-feature, concrete.
 * Draft-for-approval: the user reviews before putting it into Goal Engine.
 */

export interface SequenceStep {
  day: number;
  channel: string; // email | sms | whatsapp
  /** value = teach/give (no ask); sales = a low-pressure, value-wrapped offer. */
  kind: "value" | "sales";
  subject?: string;
  message: string;
}

export async function draftSequence(params: {
  brandName?: string;
  goal: string;
  knowledge: string;
  preferences?: string;
  /** Verified benefit facts to teach with (attributed). */
  benefits?: string;
  /** The booking/conversion link — used as the call-to-action in sales steps. */
  ctaUrl?: string;
  /** A general website link — added softly to every email step. */
  websiteUrl?: string;
}): Promise<SequenceStep[]> {
  const { brandName, goal, knowledge, preferences, benefits, ctaUrl, websiteUrl } = params;

  const system =
    "You are a senior lifecycle/retention marketer and direct-response copywriter. Design a 30-DAY " +
    "nurture campaign (email/SMS) for a lead who engaged but hasn't bought — one that earns trust by " +
    "GIVING VALUE, not by constantly selling. Ground it ONLY in the brand context, the verified " +
    "benefit facts, the real customer objections and the winning angles provided — never invent " +
    "claims, numbers or testimonials.\n\n" +
    "THE 80/20 RULE (follow strictly):\n" +
    '- ~80% of steps are VALUE steps (kind:"value"): teach ONE genuinely useful idea, insight, tip or ' +
    "benefit the reader gains just by reading — NO sales ask (a soft one-line P.S. at most). Use the " +
    "verified benefit facts to make these credible, and ATTRIBUTE every stat to its named source.\n" +
    '- ~20% of steps are SALES steps (kind:"sales"): a clear but low-pressure, value-wrapped offer ' +
    "(a free lead-response audit, a demo, a checklist). Space them out — never two sales steps in a row.\n\n" +
    "CAMPAIGN SHAPE:\n" +
    "- 10–12 steps spread over 30 days (roughly every 2–3 days), starting day 0. ONE job per step, ONE " +
    "clear next step each (for value steps that's 'reply/learn more', NOT 'buy').\n" +
    "- Open with pure value to earn attention. Place the 2–3 sales steps around the middle and near " +
    "day 30. End friendly and low-pressure — never a hard close.\n" +
    "- Handle the lead's real objections along the way, framed as helpful value, not rebuttal.\n\n" +
    "COPY: problem-recognition or curiosity opener, lead with the benefit/outcome (not features), " +
    "specific and concrete, plain human language, one idea per message, active voice. ~70% email, " +
    "occasional SMS. Email subjects: clear, benefit- or curiosity-driven, ~40–60 chars. Follow the " +
    "brand voice and the user's learned style preferences closely.\n\n" +
    "LINKS (follow exactly, and never invent a URL):\n" +
    "- WEBSITE LINK: when a website URL is provided, add it to EVERY email step as a soft, optional " +
    "'if you'd like to look, here's our site' reference — a short low-key closing line (e.g. 'More on " +
    "our site: <website>'). It is for browsing, NOT a push. Do NOT put it in SMS steps (keep those short).\n" +
    "- CTA LINK: when a booking/CTA link is provided, EVERY sales step (kind:\"sales\", roughly 1 in 5) " +
    "MUST use that exact URL, written in full, as its main call-to-action (e.g. 'Book a quick call: " +
    "<cta>'). Value steps do NOT use the CTA link.\n" +
    "- If a link isn't provided, use a soft reply-based CTA (e.g. \"reply 'audit'\") instead.\n\n" +
    "Return ONLY JSON: " +
    '{"steps":[{"day":0,"channel":"email|sms","kind":"value|sales","subject":"(email only)","message":"..."}]} ' +
    "— 10 to 12 steps over ~30 days, with about 80% kind:value.";

  const prefs = preferences
    ? `HOW THIS USER LIKES DRAFTS (learned from their edits — match this closely):\n${preferences}\n\n`
    : "";

  const user =
    `BRAND: ${brandName ?? "the brand"}\n` +
    `CAMPAIGN GOAL (the eventual conversion, reached gently — most steps should NOT push it): ${goal}\n\n` +
    (ctaUrl ? `CTA/BOOKING LINK (sales steps' call-to-action): ${ctaUrl}\n` : "") +
    (websiteUrl ? `WEBSITE LINK (add softly to every email): ${websiteUrl}\n` : "") +
    (ctaUrl || websiteUrl ? "\n" : "") +
    (benefits ? `${benefits}\n\n` : "") +
    `WHAT WE'VE LEARNED FROM REAL CUSTOMERS (weave in as value; address objections helpfully):\n${knowledge || "(no learned insights yet — use general best practice)"}\n\n` +
    prefs +
    "Design the 30-day campaign as JSON.";

  // A 30-day campaign is a long output — give it room, and retry once if the
  // JSON comes back empty/truncated (avoids the occasional blank draft).
  let steps: unknown;
  for (let attempt = 0; attempt < 2 && !Array.isArray(steps); attempt++) {
    const json = (await chatJSON(system, user, 9000)) as { steps?: unknown } | null;
    steps = json?.steps;
  }
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s) => {
      const o = s as {
        day?: unknown;
        channel?: unknown;
        kind?: unknown;
        subject?: unknown;
        message?: unknown;
      };
      return {
        day: Number.isFinite(Number(o.day)) ? Number(o.day) : 0,
        channel: String(o.channel ?? "email"),
        kind: o.kind === "sales" ? ("sales" as const) : ("value" as const),
        subject: o.subject ? String(o.subject) : undefined,
        message: String(o.message ?? "").trim(),
      };
    })
    .filter((s) => s.message);
}
