import { z } from "zod";

/**
 * The goal-level FLOW — the editable sequence the agency owns. AI drafts it;
 * the user edits it (add/remove/reorder steps, change waits, edit content).
 * `content` is a brief/message; at send time, `personalize: "ai"` rewrites it
 * per lead from their history, while `"verbatim"` sends it as-is (merge fields).
 */
// "voicemail" is an opt-in, consent-gated drop via Retell (see executeStep);
// `content` is the spoken message.
export const FlowChannel = z.enum(["sms", "email", "whatsapp", "voice", "voicemail"]);
// "opened" fires only if the contact opened a prior email but hasn't replied —
// use it to trigger a cheap email nudge on real engagement.
export const FlowCondition = z.enum(["always", "no_reply", "no_answer", "opened"]);

export const FlowStepSchema = z.object({
  id: z.string(),
  channel: FlowChannel,
  wait_hours: z.number().min(0),
  if: FlowCondition.default("always"),
  subject: z.string().optional(), // email only
  content: z.string(),
  personalize: z.enum(["ai", "verbatim"]).default("ai"),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

export const FlowSchema = z.object({ steps: z.array(FlowStepSchema) });
export type Flow = z.infer<typeof FlowSchema>;

export const EMPTY_FLOW: Flow = { steps: [] };
