import { chatJSON } from "./openai";

/**
 * Drafts a short retargeting sequence (for Goal Engine) grounded in what the
 * brain has learned — handling real objections and using winning angles.
 * The prompt encodes proven frameworks distilled from the marketing skills:
 *   - ads (retargeting): don't repeat the same ask; lead with a different angle
 *     / value-first step; use verbatim objections as hooks; layer in proof.
 *   - emails: one job per step, value-before-ask, re-engagement shape + cadence,
 *     one CTA each, subject-line formulas.
 *   - copywriting: problem-recognition openers, benefit-over-feature, concrete.
 * Draft-for-approval: the user reviews before putting it into Goal Engine.
 */

export interface SequenceStep {
  day: number;
  channel: string; // email | sms | whatsapp
  subject?: string;
  message: string;
}

export async function draftSequence(params: {
  brandName?: string;
  goal: string;
  knowledge: string;
  preferences?: string;
}): Promise<SequenceStep[]> {
  const { brandName, goal, knowledge, preferences } = params;

  const system =
    "You are a senior retargeting strategist and direct-response copywriter. Design a short " +
    "multi-step win-back sequence (email/SMS) for a lead who engaged but didn't convert. Ground it " +
    "ONLY in the brand context, the REAL customer objections and the winning angles provided — " +
    "never invent claims, numbers or testimonials.\n\n" +
    "RETARGETING PRINCIPLES (apply all):\n" +
    "- Don't just repeat the original ask louder in every step. The #1 reason a lead didn't act is " +
    "the offer wasn't right for them — so vary the angle across steps, and offer a lower-friction, " +
    "VALUE-FIRST alternative (a free audit / assessment / useful resource) instead of only 'book now'.\n" +
    "- Make ONE step an objection-handler that names the lead's biggest real objection in their own " +
    "words (from the insights below) and answers it honestly.\n" +
    "- Make ONE step proof/reassurance (a concrete result, mechanism or social-proof angle) — only " +
    "if supportable by the context; never fabricate proof.\n" +
    "- Earn the ask: value before the pitch; end on ONE clear, low-risk offer / last-chance.\n\n" +
    "SEQUENCE DESIGN:\n" +
    "- 3–5 steps over a sensible cadence (e.g. day 0, 2, 5, 9). ONE job per step, ONE clear CTA each.\n" +
    "- Strong shape (compress to the step count): (1) re-open with value or a fresh angle, " +
    "(2) handle the biggest objection, (3) proof/reassurance, (4) value-first offer / last-chance.\n" +
    "- Email subjects: clear over clever, benefit- or curiosity-driven, ~40–60 chars " +
    "(e.g. 'Still stuck with missed calls?', 'The 60-second fix for {problem}'). SMS: no subject, " +
    "short and human, one question or one CTA.\n\n" +
    "COPY: open with problem-recognition, lead with the benefit/outcome (not features), stay " +
    "specific and concrete, plain human language, active voice. Follow the user's learned style " +
    "preferences and brand voice closely when provided.\n\n" +
    "Return ONLY JSON: " +
    '{"steps":[{"day":0,"channel":"email|sms","subject":"(email only)","message":"..."}]} — 3 to 5 steps.';

  const prefs = preferences
    ? `HOW THIS USER LIKES DRAFTS (learned from their edits — match this closely):\n${preferences}\n\n`
    : "";

  const user =
    `BRAND: ${brandName ?? "the brand"}\n` +
    `GOAL: ${goal}\n\n` +
    `WHAT WE'VE LEARNED FROM REAL CUSTOMERS (address these directly):\n${knowledge || "(no learned insights yet — use general best practice)"}\n\n` +
    prefs +
    "Design the sequence as JSON.";

  const json = (await chatJSON(system, user)) as { steps?: unknown } | null;
  const steps = json?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s) => {
      const o = s as { day?: unknown; channel?: unknown; subject?: unknown; message?: unknown };
      return {
        day: Number.isFinite(Number(o.day)) ? Number(o.day) : 0,
        channel: String(o.channel ?? "email"),
        subject: o.subject ? String(o.subject) : undefined,
        message: String(o.message ?? "").trim(),
      };
    })
    .filter((s) => s.message);
}
