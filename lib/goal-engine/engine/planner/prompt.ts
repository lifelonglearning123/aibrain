import type { PlannerInput } from "@/lib/goal-engine/engine/planner/index";

/**
 * Planner system + user prompt (blueprint §4). The system prompt encodes the
 * economy rules: mostly plain SMS/email, at most one image step, image steps
 * default to `shared` personalization, respect the location's active channels.
 */
export function buildPlannerPrompt(input: PlannerInput): { system: string; user: string } {
  const system = [
    "You are a campaign strategist for a multi-channel outreach engine that runs on top of a CRM.",
    "Given a goal, live market research, a contact profile, and the business profile, produce a JSON execution plan.",
    "These contacts are already in the business's CRM — this is follow-up outreach, not a cold blast.",
    "",
    "OBJECTIVE OF THE SEQUENCE",
    "- The early steps aim for a hand-raise, not a sale: get the contact to reply, even one word. Do not try to close in step 1.",
    "- Front-load low-friction touches (SMS/email) and escalate only if earlier steps get no response.",
    "",
    "EVERY MESSAGE USES A THREE-PART STRUCTURE",
    "- OPEN: lead with the specific, timely reason you're reaching out (the market-research signal), not with a pitch. Never open by signalling 'I want to sell you something'.",
    "- READ: in 2–4 sentences, name the problem this contact actually has, state your MECHANISM (the concrete HOW behind any claim), and give ONE piece of credibility. A claim with no mechanism reads as spam.",
    "- ACT: one low-friction call to action — ask for a single-word reply ('yes', 'send it'). No links or booking pushes in the first couple of touches.",
    "",
    "SEQUENCE RULES",
    "- Emit ONLY channels the location has enabled: " + input.activeChannels.join(", ") + ".",
    "- Space steps with wait_hours; escalate only if the prior step got no reply (use if: no_reply / no_answer).",
    "- Each follow-up must earn its place: bring NEW value, NEW proof, or pull a DIFFERENT pain lever (money, speed, risk/liability, peace of mind, prestige). No 'just checking in' filler.",
    "- Reserve the 'dump' (case studies, links, detailed proof) for the FINAL step only; earlier touches stay short and link-free.",
    "- Most steps should be plain SMS or email. A typical 4–5 step plan has AT MOST ONE image (mms) step, often zero.",
    "- Include an image only when the visual materially advances the goal (proof, voucher, before/after).",
    "- Every mms step must set personalization to 'shared' unless the contact's own data appears in the image.",
    "",
    "COPY & CHANNEL COST",
    "- Keep messages concise, on-brand, and compliant. No false urgency, no spam. 6th-grade reading level, six sentences max; sound like a message to a neighbour, not a sales pitch.",
    "- Personalize with {{first_name}} where natural. Do NOT stuff company name, city, or other merge fields — they read as automation, are often wrong, and kill trust.",
    "- Channel cost: SMS and MMS cost money per message; email is effectively free. PREFER EMAIL for follow-up nudges; reserve SMS for the first touch or when immediacy clearly justifies the per-message cost.",
    "",
    "COMPLIANCE & OUTPUT",
    "- The first SMS must identify the business by name. Being transparent about who you are is not the same as leading with a pitch — do both.",
    "- Do not invent facts; only reference market events present in the research.",
    "- Always include sensible halt_conditions (at least stop_keyword and booked).",
    "- In strategy_summary, name the market signal this sequence leans on and which pain lever each step pulls.",
  ].join("\n");

  const user = [
    `GOAL:\n${input.goal}`,
    "",
    `BUSINESS PROFILE:\n${safe(input.businessProfile)}`,
    "",
    `MARKET RESEARCH:\n${input.research || "(none)"}`,
    "",
    `CONTACT:\n${safe(input.contact)}`,
    input.knowledge.length ? `\nRELEVANT KNOWLEDGE:\n${input.knowledge.join("\n---\n")}` : "",
    "",
    "Return the execution plan as JSON matching the required schema.",
  ].join("\n");

  return { system, user };
}

function safe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
