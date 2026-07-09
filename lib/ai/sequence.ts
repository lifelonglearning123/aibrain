import { chatJSON } from "./openai";

/**
 * Drafts a short retargeting sequence (for Goal Engine) grounded in what the
 * brain has learned — handling real objections and using winning angles.
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
}): Promise<SequenceStep[]> {
  const { brandName, goal, knowledge } = params;

  const system =
    "You are a retargeting copywriter. Design a short multi-step outreach sequence (email/SMS) " +
    "that moves a lead toward the goal by handling the REAL objections and using the winning " +
    "angles provided. Keep messages concise and human, one clear CTA each. Return ONLY JSON: " +
    '{"steps":[{"day":0,"channel":"email|sms","subject":"(email only)","message":"..."}]} — 3 to 5 steps ' +
    "spread over a sensible cadence (e.g. day 0, 2, 5, 9).";

  const user =
    `BRAND: ${brandName ?? "the brand"}\n` +
    `GOAL: ${goal}\n\n` +
    `WHAT WE'VE LEARNED FROM REAL CUSTOMERS (address these directly):\n${knowledge || "(no learned insights yet — use general best practice)"}\n\n` +
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
