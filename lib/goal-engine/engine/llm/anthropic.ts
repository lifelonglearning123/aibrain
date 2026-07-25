import type { ChatOptions, ChatResult } from "@/lib/goal-engine/engine/llm/types";

/**
 * Anthropic Messages API transport (raw fetch — no SDK, per the build spec).
 *
 * Verified against the API reference (2026-07):
 *  - Fable 5 (`claude-fable-5`): thinking is ALWAYS ON — omit the `thinking`
 *    param entirely (sending it 400s). No `temperature`/`top_p`/`top_k`.
 *  - Structured output via `output_config.format` (json_schema) — supported on
 *    Fable 5 + Haiku 4.5. `effort` is supported on Fable but ERRORS on Haiku.
 *  - Handle `stop_reason: "refusal"` (HTTP 200) before reading content.
 *  - Opt into a server-side fallback (beta) when ANTHROPIC_FALLBACK_MODEL is set.
 */
export async function anthropicChat(model: string, opts: ChatOptions): Promise<ChatResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const isHaiku = model.includes("haiku");
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 16000,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;

  const outputConfig: Record<string, unknown> = {};
  if (opts.effort && !isHaiku) outputConfig.effort = opts.effort;
  if (opts.jsonSchema) outputConfig.format = { type: "json_schema", schema: opts.jsonSchema };
  if (Object.keys(outputConfig).length) body.output_config = outputConfig;
  // NOTE: deliberately no `thinking`, `temperature`, `top_p`, `top_k`.

  const headers: Record<string, string> = {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };

  // Opt-in refusal fallback (recommended for Fable). Remove the env to disable.
  const fallbackModel = process.env.ANTHROPIC_FALLBACK_MODEL;
  if (fallbackModel) {
    headers["anthropic-beta"] = "server-side-fallback-2026-06-01";
    body.fallbacks = [{ model: fallbackModel }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    stop_reason?: string;
    stop_details?: { category?: string };
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  if (data.stop_reason === "refusal") {
    throw new Error(`Anthropic refusal (${data.stop_details?.category ?? "unknown"})`);
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  return {
    text,
    usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
    servedBy: `anthropic:${data.model ?? model}`,
  };
}
