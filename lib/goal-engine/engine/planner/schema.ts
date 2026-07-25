import { z } from "zod";

/**
 * The execution-plan contract (blueprint §4). The planner LLM MUST emit an
 * object matching this schema via structured-output / tool-use — the executor
 * treats the result as pure data. New step types = new executor handlers, no
 * retraining. Validate every plan with `PlanSchema.parse()` before persisting
 * to `campaigns.plan`.
 */

export const StepChannel = z.enum(["sms", "email", "mms", "voice", "wait", "branch"]);
export type StepChannel = z.infer<typeof StepChannel>;

/** Condition gating a step — evaluated against campaign state before executing. */
export const StepCondition = z.enum([
  "always",
  "no_reply",
  "no_answer",
  "not_booked",
  "opened_not_clicked",
]);

const BaseStep = z.object({
  i: z.number().int().nonnegative(),
  channel: StepChannel,
  /** Hours to wait AFTER the previous step before this one fires. */
  wait_hours: z.number().min(0).default(0),
  /** Gate — skip this step unless the condition holds. Default: always. */
  if: StepCondition.default("always"),
  /** What outcome means this step "worked" (for branching/analytics). */
  success_signal: z.string().optional(),
});

const SmsStep = BaseStep.extend({
  channel: z.literal("sms"),
  message: z.string().min(1),
});

const EmailStep = BaseStep.extend({
  channel: z.literal("email"),
  subject: z.string().min(1),
  body_brief: z.string().optional(),   // brief the drafter expands, OR:
  body: z.string().optional(),         // fully-written body
});

const MmsStep = BaseStep.extend({
  channel: z.literal("mms"),
  message: z.string().min(1),
  image_prompt: z.string(),
  image_engine: z.enum(["nano_banana_2", "gpt_image_2"]).default("nano_banana_2"),
  overlay_engine: z.enum(["gpt_image_2"]).optional(),
  overlay_text: z.string().optional(),
  /** 'shared' → one render reused across the whole cohort (default, cheap).
   *  'per_contact' → contact data appears in the image (name/neighbourhood). */
  personalization: z.enum(["shared", "per_contact"]).default("shared"),
});

const VoiceStep = BaseStep.extend({
  channel: z.literal("voice"),
  call_objective: z.string(),
  voice_script_brief: z.string().optional(),
});

const WaitStep = BaseStep.extend({ channel: z.literal("wait") });

const BranchStep = BaseStep.extend({
  channel: z.literal("branch"),
  branches: z.array(z.object({ when: z.string(), goto_step: z.number().int() })),
});

export const PlanStep = z.discriminatedUnion("channel", [
  SmsStep, EmailStep, MmsStep, VoiceStep, WaitStep, BranchStep,
]);
export type PlanStep = z.infer<typeof PlanStep>;

export const PlanSchema = z.object({
  strategy_summary: z.string(),
  steps: z.array(PlanStep).min(1),
  booking: z
    .object({ calendar_hint: z.string().optional(), duration_min: z.number().int().positive().default(30) })
    .optional(),
  halt_conditions: z.array(z.string()).default(["stop_keyword", "booked", "wrong_number"]),
});
export type Plan = z.infer<typeof PlanSchema>;

// The JSON Schema the LLM is constrained to lives in `lib/planner/json-schema.ts`;
// this Zod schema is the strict validator applied after the model responds.
