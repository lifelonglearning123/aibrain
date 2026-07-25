import { chat, parseJson, type ChatUsage } from "@/lib/goal-engine/engine/llm";
import type { JsonSchema } from "@/lib/goal-engine/engine/llm/types";

/**
 * Inbound intent classification (blueprint §7). Runs on the cheap `router` role
 * (OpenRouter/Kimi or GPT by default — hybrid). A dumb STOP keyword check runs
 * BEFORE this in the webhook route; this is the model pass for everything else.
 */

export type Intent =
  | "interested"
  | "question"
  | "reschedule_request"
  | "soft_no"
  | "hard_no"
  | "stop"
  | "wrong_number";

export interface IntentResult {
  intent: Intent;
  confidence: number;
  usage: ChatUsage;
}

const INTENT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence"],
  properties: {
    intent: {
      type: "string",
      enum: ["interested", "question", "reschedule_request", "soft_no", "hard_no", "stop", "wrong_number"],
    },
    confidence: { type: "number" },
  },
};

const SYSTEM =
  "You classify a single inbound CRM message from a contact who is in an outreach sequence. " +
  "Return the single best intent and a confidence 0–1. Be conservative: if the message asks a " +
  "question, use 'question'; if it wants a different time, 'reschedule_request'; explicit opt-out " +
  "requests (unsubscribe, remove me, take me off your list) are 'stop'. Distinguish two kinds of no: " +
  "'hard_no' = a firm, final rejection that is NOT an opt-out request (e.g. 'we'll never switch', " +
  "'not interested and never will be'); 'soft_no' = a polite or soft decline that leaves the door " +
  "open (e.g. 'not right now', 'maybe later', 'we're all set for now'). When a no could be either, " +
  "prefer 'soft_no'.";

export async function classifyIntent(message: string, context?: string): Promise<IntentResult> {
  const user = context ? `CONTEXT:\n${context}\n\nMESSAGE:\n${message}` : `MESSAGE:\n${message}`;
  const result = await chat("router", {
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    jsonSchema: INTENT_SCHEMA,
    maxTokens: 200,
  });
  const parsed = parseJson<{ intent: Intent; confidence: number }>(result);
  return { intent: parsed.intent, confidence: parsed.confidence, usage: result.usage };
}
