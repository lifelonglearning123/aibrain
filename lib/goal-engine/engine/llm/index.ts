import { MODEL_ROLES, type LlmRole } from "@/lib/goal-engine/engine/config/decisions";
import type { ChatOptions, ChatResult } from "@/lib/goal-engine/engine/llm/types";
import { anthropicChat } from "@/lib/goal-engine/engine/llm/anthropic";
import { openaiCompatChat } from "@/lib/goal-engine/engine/llm/openai-compatible";

export type { ChatMessage, ChatResult, ChatUsage, JsonSchema } from "@/lib/goal-engine/engine/llm/types";

/**
 * The one entry point for every LLM call. Pick a ROLE (planner / router /
 * drafter); the role→model registry in decisions.ts resolves which
 * provider+model actually runs — that's the hybrid + OpenRouter wiring.
 */
export async function chat(role: LlmRole, opts: ChatOptions): Promise<ChatResult> {
  const ref = MODEL_ROLES[role];
  if (ref.provider === "anthropic") return anthropicChat(ref.model, opts);
  return openaiCompatChat(ref.provider, ref.model, opts);
}

/** Parse a structured-output response as JSON (throws on malformed output). */
export function parseJson<T>(result: ChatResult): T {
  try {
    return JSON.parse(result.text) as T;
  } catch {
    // Some models wrap JSON in ```json fences — strip and retry once.
    const stripped = result.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(stripped) as T;
  }
}
