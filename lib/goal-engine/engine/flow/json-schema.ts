import type { JsonSchema } from "@/lib/goal-engine/engine/llm/types";

/** JSON Schema for the AI flow draft. id/personalize are added server-side. */
export const FLOW_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "wait_hours", "if", "content"],
        properties: {
          channel: { type: "string", enum: ["sms", "email", "whatsapp", "voice"] },
          wait_hours: { type: "number" },
          if: { type: "string", enum: ["always", "no_reply", "no_answer"] },
          subject: { type: "string" },
          content: { type: "string" },
        },
      },
    },
  },
};
