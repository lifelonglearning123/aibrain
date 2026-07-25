import crypto from "node:crypto";
import { chat, parseJson } from "@/lib/goal-engine/engine/llm";
import { research } from "@/lib/goal-engine/engine/planner/research";
import { FLOW_JSON_SCHEMA } from "@/lib/goal-engine/engine/flow/json-schema";
import { FlowSchema, type Flow } from "@/lib/goal-engine/engine/flow/schema";

const CHANNELS = ["sms", "email", "whatsapp", "voice"];

/**
 * AI-draft the goal's flow at the GOAL level (blueprint §4). Honors the chosen
 * channels + campaign length + frequency; any left empty, the AI decides.
 */
export async function generateFlow(input: {
  goal: string;
  businessProfile: unknown;
  channels: string[];
  lengthDays?: number | null;
  frequency?: string | null;
  target?: { type?: string | null; link?: string | null };
  /** Learned knowledge from the AI Brain (winning angles, objections, taught facts). */
  brainKnowledge?: string | null;
}): Promise<Flow> {
  const r = await research([input.goal]);
  const channels = input.channels?.length ? input.channels : ["sms", "email"];

  const cadence: string[] = [];
  if (input.lengthDays) cadence.push(`Spread the whole sequence over about ${input.lengthDays} days.`);
  else cadence.push("Choose a sensible overall campaign length.");
  if (input.frequency?.trim()) cadence.push(`Cadence guidance: ${input.frequency.trim()}.`);

  const verb = input.target?.type === "form" ? "fill out our form" : input.target?.type === "sales" ? "complete their purchase" : "book a time on our calendar";
  const targetLine = input.target?.link
    ? `- The campaign's single objective is to get the lead to ${verb}. Include this EXACT link as the primary call-to-action where it fits naturally — keep the URL intact, do not shorten it: ${input.target.link}`
    : `- The campaign's objective is to get the lead to ${verb}.`;

  const system = [
    "You are a campaign strategist. Draft an editable multi-step outreach sequence for a CRM.",
    "The agency will review and edit this, so write clear, natural, on-brand copy for each step.",
    "",
    "Rules:",
    targetLine,
    "- Use ONLY these channels: " + channels.join(", ") + ". Prefer the cheaper channels (sms/email/whatsapp) for most steps; use voice sparingly for high-intent moments.",
    "- Space steps with wait_hours (0 for the first). " + cadence.join(" "),
    "- Escalate only when there's no reply — set `if` to no_reply / no_answer for later steps.",
    "- Each step's `content` is the message (email steps also need a short `subject`; voice `content` is a short call brief/objective).",
    "- Write it so it reads well as-is AND works as a brief that gets personalized per lead.",
    "- Use {{first_name}} where natural. Keep it concise and compliant — no false urgency.",
  ].join("\n");

  const user = [
    `GOAL:\n${input.goal}`,
    `\nBUSINESS PROFILE:\n${safe(input.businessProfile)}`,
    `\nMARKET RESEARCH:\n${r.digest || "(none)"}`,
    input.brainKnowledge
      ? `\nPROVEN KNOWLEDGE FROM THE AI BRAIN — this is what actually wins deals for this business, learned from real calls, emails and campaign outcomes. Lead with the winning angles, pre-empt the objections, and follow any stated rules/style:\n${input.brainKnowledge}`
      : "",
    "\nReturn the sequence as JSON matching the schema.",
  ].join("\n");

  const result = await chat("planner", {
    system,
    messages: [{ role: "user", content: user }],
    jsonSchema: FLOW_JSON_SCHEMA,
    effort: "high",
    maxTokens: 8000,
  });

  const raw = parseJson<{ steps: Array<Record<string, unknown>> }>(result);
  const allowed = new Set(channels);
  const steps = (raw.steps ?? [])
    .map((s) => ({
      id: crypto.randomUUID(),
      channel: (CHANNELS.includes(String(s.channel)) ? s.channel : "sms") as string,
      wait_hours: Number(s.wait_hours) || 0,
      if: (["always", "no_reply", "no_answer"].includes(String(s.if)) ? s.if : "always") as string,
      subject: typeof s.subject === "string" ? s.subject : undefined,
      content: typeof s.content === "string" ? s.content : "",
      personalize: "ai" as const,
    }))
    .filter((s) => allowed.has(s.channel));

  return FlowSchema.parse({ steps });
}

function safe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
