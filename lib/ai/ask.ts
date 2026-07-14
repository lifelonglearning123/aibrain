import { chatWithTools, openaiConfig } from "./openai";
import { buildTools, runTool, type AskCtx } from "./ask-tools";
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

  const system =
    `You are the user's AI business brain for ${scopeLine}. ` +
    "You have TOOLS that fetch LIVE business data (Stripe revenue & subscriptions, GHL pipeline & " +
    "deals, Xero/QuickBooks accounting, Facebook ad spend) and a learned knowledge base from real " +
    "sales calls, emails and Loom recaps. ALWAYS call the relevant tool(s) to get real, current " +
    "numbers before answering a data question — never guess or rely on memory. For questions that " +
    "span multiple companies, call the tool once per company. Cite the actual figures you retrieved " +
    "(with currency). If a tool returns an error/note (e.g. 'not_configured' or 'not_connected'), " +
    "say plainly that the source isn't connected and what to connect. Only discuss the company/" +
    "companies in scope — never reference other businesses. Be concise, direct and useful — a sharp " +
    "advisor, not a chatbot. Today's questions are about money, pipeline and customers, so prefer " +
    "hard numbers over generalities.";

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
