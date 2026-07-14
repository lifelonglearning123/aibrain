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

/** Embed text for semantic search (text-embedding-3-small, 1536 dims). Null if no key/error. */
export async function embed(text: string): Promise<number[] | null> {
  const { apiKey } = await openaiConfig();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const v = data?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
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

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: any };
}
export type ToolExecutor = (name: string, args: any) => Promise<any>;

/**
 * Agentic chat: the model may call the provided tools (function-calling) to fetch
 * live data before answering. We run the tool loop server-side and feed results
 * back until the model returns a final text answer. Returns null if no key.
 */
export async function chatWithTools(
  messages: any[],
  tools: ToolDef[],
  exec: ToolExecutor,
  maxRounds = 6,
): Promise<{ answer: string | null; toolsUsed: string[] }> {
  const { apiKey, model } = await openaiConfig();
  if (!apiKey) return { answer: null, toolsUsed: [] };

  const msgs: any[] = [...messages];
  const toolsUsed: string[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const body: any = {
      model,
      messages: msgs,
      max_completion_tokens: 4000,
    };
    // Offer tools while we still have rounds left to act on their results;
    // on the final round force a plain answer so we always return something.
    if (round < maxRounds - 1) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`openai_${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { answer: null, toolsUsed };

    const calls = msg.tool_calls;
    if (Array.isArray(calls) && calls.length) {
      // Preserve the assistant turn (with tool_calls), then answer every call.
      // Run the calls concurrently (a multi-company question fires one per brand)
      // so independent live-data fetches don't serialize into a timeout.
      msgs.push(msg);
      const results = await Promise.all(
        calls.map(async (tc: any) => {
          const name = tc?.function?.name ?? "unknown";
          toolsUsed.push(name);
          let parsed: any = {};
          try {
            parsed = JSON.parse(tc?.function?.arguments || "{}");
          } catch {
            parsed = {};
          }
          try {
            return { tc, result: await exec(name, parsed) };
          } catch (e) {
            return { tc, result: { error: e instanceof Error ? e.message : "tool_failed" } };
          }
        }),
      );
      for (const { tc, result } of results) {
        msgs.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result ?? null).slice(0, 12000),
        });
      }
      continue; // let the model read the tool results
    }

    return { answer: msg.content ?? null, toolsUsed };
  }
  return { answer: null, toolsUsed };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
