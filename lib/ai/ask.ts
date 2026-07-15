import { chatWithTools, openaiConfig } from "./openai";
import { buildTools, runTool, type AskCtx } from "./ask-tools";
import { getTaughtFacts } from "./brain-facts";
import { getBrandProfiles, profilePrompt, brandName } from "@/lib/brand-profile";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Ask-your-data — an agentic advisor. The model is given read-only "sensor" tools
 * (live Stripe/GHL/Xero/Facebook data + the learned knowledge base) and calls
 * whichever it needs to answer from real, current numbers — including drill-down
 * detail like a subscriber-level MRR breakdown. Every tool is access-scoped to the
 * companies this user may see (see lib/ai/ask-tools.ts).
 */
export async function answerQuestion(params: {
  question: string;
  history?: { role: string; content: string }[];
  /** Companies this user may see. */
  brands: EntityKey[];
  /** Owners can also read portfolio-wide shared lessons + the portfolio brief. */
  isOwner: boolean;
}): Promise<{ ok: boolean; answer?: string; error?: string; toolsUsed?: string[] }> {
  if (!(await openaiConfig()).configured) return { ok: false, error: "openai_not_configured" };
  if (!params.brands.length) return { ok: false, error: "no_access" };

  const ctx: AskCtx = { brands: params.brands, isOwner: params.isOwner };

  const brandNames = ENTITIES.filter((e) => params.brands.includes(e.key))
    .map((e) => e.name)
    .join(", ");
  const scopeLine = params.isOwner
    ? "a 3-brand portfolio — macaws.ai (AI tools), Artificial Ignorance, and Leonardo"
    : `the following company/companies you are responsible for: ${brandNames}`;

  // Business context (author-written profile per brand) — the foundation that
  // makes answers business-specific instead of generic.
  const profiles = await getBrandProfiles(params.brands);
  const profileBlock = Object.entries(profiles)
    .map(([key, p]) => profilePrompt(p, brandName(key as EntityKey)))
    .filter(Boolean)
    .join("\n\n");

  // Durable facts the user has taught the brain — always applied so it stops
  // repeating a known-wrong interpretation (the "learning loop").
  const facts = await getTaughtFacts(params.brands, params.isOwner);
  const factsBlock = facts.length
    ? "\n\nTAUGHT FACTS & CORRECTIONS (the user has told you these; ALWAYS apply them, they override any tool output or prior belief):\n" +
      facts
        .map((f) => `- ${f.entityKey ? `[${f.entityKey}] ` : "[all] "}${f.text}`)
        .join("\n")
    : "";

  const system =
    `You are the user's AI business brain for ${scopeLine}. ` +
    "You have TOOLS that fetch LIVE business data (Stripe revenue & subscriptions, revenue mix, GHL " +
    "pipeline & deals, Xero/QuickBooks accounting, Facebook ad spend) and a learned knowledge base. " +
    "\n\nHARD RULES:\n" +
    "1. EVERY number you state must come from a tool call you made in THIS conversation. Never state " +
    "a figure from memory, a previous turn, or any summary/brief — if you haven't just retrieved it, " +
    "call the tool.\n" +
    "2. For revenue/MRR, report the NET figure (after discounts) and the number of PAYING subscribers. " +
    "Never report gross/list-price MRR as the headline — it counts free/test accounts.\n" +
    "3. For multi-company questions, call the tool once per company.\n" +
    "4. If a tool returns an error/note (e.g. 'not_configured'), say the source isn't connected and " +
    "what to connect — don't invent a number.\n" +
    "5. Only discuss the company/companies in scope; never reference other businesses.\n" +
    "Be concise, direct and useful — a sharp advisor, not a chatbot. Prefer hard numbers over " +
    "generalities." +
    (profileBlock ? `\n\n${profileBlock}` : "") +
    factsBlock;

  const history = Array.isArray(params.history) ? params.history.slice(-8) : [];
  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content),
    })),
    { role: "user", content: params.question },
  ];

  try {
    const { answer, toolsUsed } = await chatWithTools(
      messages,
      buildTools(ctx),
      (name, args) => runTool(name, args, ctx),
    );
    return answer
      ? { ok: true, answer, toolsUsed }
      : { ok: false, error: "no_answer" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ask_failed" };
  }
}
