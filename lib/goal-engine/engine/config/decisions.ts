/**
 * The architectural forks from BUILD_PLAN.md, in one place. Everything
 * fork-dependent reads from here so a decision change is a config edit.
 */

export type LlmProvider = "anthropic" | "openai" | "openrouter";
export type SearchProvider = "tavily" | "brave";
export type DurableEngine = "vercel-cron" | "pgcron" | "inngest";

/** A model is addressed as "<provider>:<model>", e.g. "anthropic:claude-fable-5". */
export interface ModelRef {
  provider: LlmProvider;
  model: string;
}

/** Roles the app plays with an LLM. Each maps to any provider+model. */
export type LlmRole = "planner" | "router" | "drafter";

function parseRef(v: string | undefined, fallback: ModelRef): ModelRef {
  if (!v) return fallback;
  const [provider, ...rest] = v.split(":");
  const model = rest.join(":");
  if (!model || !["anthropic", "openai", "openrouter"].includes(provider)) return fallback;
  return { provider: provider as LlmProvider, model };
}

/**
 * HYBRID default (fork #2, per your decision): Anthropic Fable-5 for the
 * high-stakes planner (best structured-plan quality + prompt caching), and
 * OpenRouter for the cheap router/drafter so you can point at Kimi K2, GPT,
 * or anything else with one key. Override any role via env:
 *   LLM_PLANNER=openrouter:moonshotai/kimi-k2
 *   LLM_ROUTER=openai:gpt-5.5-mini
 */
export const MODEL_ROLES: Record<LlmRole, ModelRef> = {
  planner: parseRef(process.env.LLM_PLANNER, { provider: "anthropic", model: "claude-fable-5" }),
  router: parseRef(process.env.LLM_ROUTER, { provider: "openrouter", model: "openai/gpt-5.4-mini" }),
  drafter: parseRef(process.env.LLM_DRAFTER, { provider: "openrouter", model: "moonshotai/kimi-k2" }),
};

export const DECISIONS = {
  /** Fork #2 resolved: hybrid via the role registry above (Anthropic + OpenRouter). */
  llm: "hybrid" as const,

  /** Planner research source. */
  searchProvider: (process.env.SEARCH_PROVIDER as SearchProvider) ?? "tavily",

  /** Fork #4 resolved: Vercel Cron (built into the Vercel app — no extra vendor).
   *  A 1-min cron scans scheduled_steps; GHL remains the CRM/channel/compliance
   *  layer. pgcron/inngest remain drop-in alternatives (same executeStep core). */
  durableEngine: (process.env.DURABLE_ENGINE as DurableEngine) ?? "vercel-cron",

  /** Fork #3 resolved: central multi-tenant + RLS. */
  tenancy: "central-multi-tenant" as const,

  /** Fork #1 resolved: ship the Phase-1 spine first (SMS/email, no voice/images). */
  phase: 1 as const,
} as const;
