import { chatText, openaiConfig } from "./openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Ask-your-data — answers questions about the business using the latest Daily
 * Brief + the full learned knowledge base (both fast DB reads, so the chat is
 * responsive). Grounded: it must cite the data, and say when data is missing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildContext(brief: any, insights: any[]): string {
  const lines: string[] = [];

  if (brief) {
    lines.push("RECENT DAILY BRIEF:");
    if (brief.headline) lines.push(`Headline: ${brief.headline}`);
    if (Array.isArray(brief.brands)) {
      for (const b of brief.brands) lines.push(`- ${b.name}: ${b.snapshot}`);
    }
    if (Array.isArray(brief.needsAttention) && brief.needsAttention.length)
      lines.push(`Needs attention: ${brief.needsAttention.join(" | ")}`);
    if (Array.isArray(brief.voiceOfCustomer) && brief.voiceOfCustomer.length)
      lines.push(`Voice of customer: ${brief.voiceOfCustomer.join(" | ")}`);
    if (Array.isArray(brief.todayFocus) && brief.todayFocus.length)
      lines.push(`Today's focus: ${brief.todayFocus.join(" | ")}`);
  }

  lines.push("", "LEARNED INSIGHTS (✓ = tied to won deals):");
  const shared = insights.filter((i) => i.scope === "shared");
  if (shared.length) {
    lines.push("[Portfolio-wide]");
    for (const i of shared) lines.push(`  (${i.kind})${i.converts ? " ✓" : ""} ${i.text}`);
  }
  const brandKeys = [
    ...new Set(
      insights.filter((i) => i.scope === "brand" && i.entity_key).map((i) => i.entity_key),
    ),
  ];
  for (const ek of brandKeys) {
    lines.push(`[${ek}]`);
    for (const i of insights.filter((i) => i.scope === "brand" && i.entity_key === ek))
      lines.push(`  (${i.kind})${i.converts ? " ✓" : ""} ${i.text}`);
  }
  return lines.join("\n");
}

export async function answerQuestion(params: {
  question: string;
  history?: { role: string; content: string }[];
  /** Companies this user may see. */
  brands: EntityKey[];
  /** Owners get the portfolio brief + shared cross-brand lessons; partners don't. */
  isOwner: boolean;
}): Promise<{ ok: boolean; answer?: string; error?: string }> {
  if (!(await openaiConfig()).configured) return { ok: false, error: "openai_not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };
  if (!params.brands.length) return { ok: false, error: "no_access" };

  // Brief: owners read the portfolio brief; partners read their own brand brief(s).
  let brief: unknown = null;
  if (params.isOwner) {
    const briefRes = await admin
      .from("daily_briefs")
      .select("content")
      .is("entity_key", null)
      .order("created_at", { ascending: false })
      .limit(1);
    brief = briefRes.data?.[0]?.content ?? null;
    if (!brief) {
      // Fallback: no portfolio brief stored yet → latest brief of any kind.
      const anyRes = await admin
        .from("daily_briefs")
        .select("content")
        .order("created_at", { ascending: false })
        .limit(1);
      brief = anyRes.data?.[0]?.content ?? null;
    }
  } else {
    const briefRes = await admin
      .from("daily_briefs")
      .select("content")
      .in("entity_key", params.brands)
      .order("created_at", { ascending: false })
      .limit(1);
    brief = briefRes.data?.[0]?.content ?? null;
  }

  // Insights: owners get everything; partners get only their brands' insights
  // (no cross-brand "shared" lessons).
  let insQuery = admin
    .from("brand_knowledge")
    .select("kind,text,converts,scope,entity_key")
    .eq("status", "active");
  if (!params.isOwner) {
    insQuery = insQuery.eq("scope", "brand").in("entity_key", params.brands);
  }
  const insRes = await insQuery;
  const insights = insRes.data ?? [];

  const context = buildContext(brief, insights);

  const brandNames = ENTITIES.filter((e) => params.brands.includes(e.key))
    .map((e) => e.name)
    .join(", ");
  const scopeLine = params.isOwner
    ? "a 3-brand portfolio: macaws.ai (tools), Artificial Ignorance, and Leonardo"
    : `the following company/companies you are responsible for: ${brandNames}`;

  const system =
    `You are the user's AI business brain for ${scopeLine}. Answer questions using ONLY the DATA ` +
    "below (a recent brief + insights learned from real calls/emails). Be specific and cite the " +
    "numbers/insights as evidence. If the data doesn't answer the question, say so plainly and name " +
    "what data would help. Only discuss the company/companies in scope — never reference other " +
    "businesses. Be concise, direct, and useful — a sharp advisor, not a chatbot.\n\nDATA:\n" +
    context;

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
    const answer = await chatText(messages);
    return answer ? { ok: true, answer } : { ok: false, error: "no_answer" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ask_failed" };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
