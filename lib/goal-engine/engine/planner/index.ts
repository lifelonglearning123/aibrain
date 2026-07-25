import { PlanSchema, type Plan } from "@/lib/goal-engine/engine/planner/schema";
import { PLAN_JSON_SCHEMA } from "@/lib/goal-engine/engine/planner/json-schema";
import { buildPlannerPrompt } from "@/lib/goal-engine/engine/planner/prompt";
import { research } from "@/lib/goal-engine/engine/planner/research";
import { chat, parseJson, type ChatUsage } from "@/lib/goal-engine/engine/llm";

/**
 * Planner orchestration (blueprint §4). Provider-agnostic: research + prompt
 * assembly happen here; the actual LLM call goes through the `planner` role
 * (Anthropic Fable-5 by default — hybrid). Output is always Zod-validated.
 */

export interface PlannerInput {
  goal: string;
  businessProfile: unknown;
  research: string;
  contact: unknown;
  knowledge: string[];
  activeChannels: string[];
}

export interface PlanCampaignInput {
  goal: string;
  businessProfile: unknown;
  contact: unknown;
  knowledge?: string[];
  activeChannels: string[];
  /** Search queries derived from the goal (2–4). Defaults to the goal itself. */
  researchQueries?: string[];
}

export interface PlanCampaignOutput {
  plan: Plan;
  researchSnapshot: unknown;
  usage: ChatUsage;
}

export async function planCampaign(input: PlanCampaignInput): Promise<PlanCampaignOutput> {
  const queries = input.researchQueries?.length ? input.researchQueries : [input.goal];
  const r = await research(queries);

  const { system, user } = buildPlannerPrompt({
    goal: input.goal,
    businessProfile: input.businessProfile,
    research: r.digest,
    contact: input.contact,
    knowledge: input.knowledge ?? [],
    activeChannels: input.activeChannels,
  });

  const result = await chat("planner", {
    system,
    messages: [{ role: "user", content: user }],
    jsonSchema: PLAN_JSON_SCHEMA,
    effort: "high",
    maxTokens: 16000,
  });

  // Never trust raw model output — parse then strictly validate before persisting.
  const plan = PlanSchema.parse(parseJson<unknown>(result));

  return {
    plan,
    researchSnapshot: { queries: r.queries, sources: r.sources, servedBy: result.servedBy },
    usage: result.usage,
  };
}
