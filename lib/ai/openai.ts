import { cred } from "@/lib/credentials";

/** Minimal OpenAI chat helper (raw fetch, no SDK). Default model gpt-5.5. */

export async function openaiConfig() {
  const apiKey = await cred("OPENAI_API_KEY");
  const model = (await cred("OPENAI_MODEL")) ?? "gpt-5.5";
  return { apiKey, model, configured: Boolean(apiKey) };
}

/** Ask the model for a JSON object. Returns parsed JSON, or null if no key. Throws on API error. */
export async function chatJSON(system: string, user: string): Promise<unknown | null> {
  const { apiKey, model } = await openaiConfig();
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      // gpt-5.x uses max_completion_tokens (not max_tokens)
      max_completion_tokens: 3000,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`openai_${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Plain-text chat (multi-turn) for conversational answers. Returns null if no key. */
export async function chatText(
  messages: { role: string; content: string }[],
): Promise<string | null> {
  const { apiKey, model } = await openaiConfig();
  if (!apiKey) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    // gpt-5.x is a reasoning model — reasoning tokens count against this budget,
    // so keep it generous or the visible answer comes back empty.
    body: JSON.stringify({ model, messages, max_completion_tokens: 4000 }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`openai_${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}
