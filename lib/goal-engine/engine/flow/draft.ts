import { chat, parseJson } from "@/lib/goal-engine/engine/llm";
import type { JsonSchema } from "@/lib/goal-engine/engine/llm/types";
import type { FlowStep } from "@/lib/goal-engine/engine/flow/schema";

/**
 * Per-lead message rendering at send time. For `personalize: "ai"` steps, the
 * cheap drafter role rewrites the step's brief into a bespoke message for THIS
 * lead using their profile + recent conversation history (point 3). Verbatim
 * steps skip this and just get merge-field substitution in the executor.
 */
export async function personalizeStep(input: {
  step: FlowStep;
  contact: { firstName?: string | null; lastName?: string | null; tags?: string[] };
  history: Array<{ direction?: string; body?: string }>;
  businessProfile?: unknown;
}): Promise<{ message: string; subject?: string }> {
  const histText = input.history
    .slice(-10)
    .map((h) => `${h.direction === "inbound" ? "Them" : "Us"}: ${h.body ?? ""}`)
    .filter((l) => l.trim().length > 4)
    .join("\n");

  const system = [
    `You write ONE outbound ${input.step.channel} message for a lead in a nurture sequence.`,
    "Use the BRIEF as your intent, and tailor it to THIS lead using their profile and history.",
    "Concise, natural, on-brand, compliant. Don't invent facts or over-promise.",
    "Preserve any links/URLs from the brief EXACTLY — never alter, shorten, or omit them.",
    input.step.channel === "email" ? "Return the message body and a short subject." : "Return only the message.",
  ].join(" ");

  const user = [
    `BRIEF (what this step should say):\n${input.step.content}`,
    `\nLEAD:\n${JSON.stringify({ first_name: input.contact.firstName, last_name: input.contact.lastName, tags: input.contact.tags })}`,
    input.businessProfile ? `\nBUSINESS:\n${safe(input.businessProfile)}` : "",
    histText ? `\nCONVERSATION HISTORY:\n${histText}` : "\nCONVERSATION HISTORY: (none yet)",
  ].join("\n");

  const schema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: { message: { type: "string" }, subject: { type: "string" } },
  };

  const result = await chat("drafter", {
    system,
    messages: [{ role: "user", content: user }],
    jsonSchema: schema,
    maxTokens: 1500,
  });
  const parsed = parseJson<{ message: string; subject?: string }>(result);
  return { message: parsed.message, subject: parsed.subject };
}

function safe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return "";
  }
}
