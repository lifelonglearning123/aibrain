import type { JsonSchema } from "@/lib/goal-engine/engine/llm/types";

/**
 * JSON Schema handed to the LLM's structured-output mechanism. Deliberately
 * permissive (one step shape with all channel fields optional) so both the
 * Anthropic and OpenAI-compatible transports accept it without per-provider
 * "all fields required" friction. `PlanSchema` (Zod) does the strict,
 * discriminated validation after parsing — this only shapes the output.
 */
export const PLAN_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategy_summary", "steps", "halt_conditions"],
  properties: {
    strategy_summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "channel", "wait_hours", "if"],
        properties: {
          i: { type: "integer" },
          channel: { type: "string", enum: ["sms", "email", "mms", "voice", "wait", "branch"] },
          wait_hours: { type: "number" },
          if: {
            type: "string",
            enum: ["always", "no_reply", "no_answer", "not_booked", "opened_not_clicked"],
          },
          success_signal: { type: "string" },
          message: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          body_brief: { type: "string" },
          image_prompt: { type: "string" },
          image_engine: { type: "string", enum: ["nano_banana_2", "gpt_image_2"] },
          overlay_engine: { type: "string", enum: ["gpt_image_2"] },
          overlay_text: { type: "string" },
          personalization: { type: "string", enum: ["shared", "per_contact"] },
          call_objective: { type: "string" },
          voice_script_brief: { type: "string" },
        },
      },
    },
    booking: {
      type: "object",
      additionalProperties: false,
      properties: { calendar_hint: { type: "string" }, duration_min: { type: "integer" } },
    },
    halt_conditions: { type: "array", items: { type: "string" } },
  },
};
