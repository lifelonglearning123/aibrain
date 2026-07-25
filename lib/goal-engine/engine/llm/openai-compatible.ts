import type { ChatOptions, ChatResult } from "@/lib/goal-engine/engine/llm/types";
import type { LlmProvider } from "@/lib/goal-engine/engine/config/decisions";

/**
 * OpenAI-compatible transport (raw fetch). Serves BOTH:
 *  - OpenAI directly (api.openai.com)
 *  - OpenRouter (openrouter.ai) — the unified gateway that unlocks Kimi K2 and
 *    any other model with one key (model strings like "moonshotai/kimi-k2").
 *
 * Structured output via `response_format: json_schema`. We use `strict: false`
 * so the permissive plan schema (optional per-channel fields) is accepted; the
 * caller re-validates strictly with Zod regardless.
 */
function endpoint(provider: LlmProvider): { baseUrl: string; apiKey: string | undefined; extraHeaders: Record<string, string> } {
  if (provider === "openrouter") {
    return {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      extraHeaders: {
        // Optional attribution headers OpenRouter recommends.
        "HTTP-Referer": process.env.APP_URL ?? "",
        "X-Title": process.env.NEXT_PUBLIC_BRAND_NAME ?? "Goal Engine",
      },
    };
  }
  return { baseUrl: "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY, extraHeaders: {} };
}

export async function openaiCompatChat(
  provider: Exclude<LlmProvider, "anthropic">,
  model: string,
  opts: ChatOptions
): Promise<ChatResult> {
  const { baseUrl, apiKey, extraHeaders } = endpoint(provider);
  if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY not set`);

  const messages = opts.system
    ? [{ role: "system", content: opts.system }, ...opts.messages]
    : opts.messages;

  const body: Record<string, unknown> = { model, messages };
  // Newer OpenAI models (gpt-5.x) reject `max_tokens` and require
  // `max_completion_tokens`; OpenRouter accepts the classic `max_tokens`.
  if (opts.maxTokens) {
    body[provider === "openai" ? "max_completion_tokens" : "max_tokens"] = opts.maxTokens;
  }
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "structured_output", schema: opts.jsonSchema, strict: false },
    };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    servedBy: `${provider}:${data.model ?? model}`,
  };
}
