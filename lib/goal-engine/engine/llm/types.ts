/** Unified LLM gateway types (provider-agnostic). */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  /** Assistant text. When a jsonSchema was requested this is a JSON string. */
  text: string;
  usage: ChatUsage;
  /** Provider+model that actually served the response. */
  servedBy: string;
}

/**
 * A JSON Schema handed to the provider's structured-output mechanism. Keep it
 * permissive (every object `additionalProperties: false`) — the caller does the
 * strict validation with Zod, so this only needs to shape the output.
 */
export type JsonSchema = Record<string, unknown>;

export interface ChatOptions {
  system?: string;
  messages: ChatMessage[];
  /** Force structured JSON output matching this schema. */
  jsonSchema?: JsonSchema;
  maxTokens?: number;
  /** Anthropic effort (ignored by OpenAI-compatible + Haiku). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}
