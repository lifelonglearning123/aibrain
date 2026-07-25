import { DECISIONS } from "@/lib/goal-engine/engine/config/decisions";

/**
 * Planner research step (blueprint §4.1). Derive 2–4 queries from the goal,
 * hit Tavily (richer) or Brave (cheaper), return a digest to store in
 * `goals.research_snapshot` and embed into `knowledge_chunks`.
 * Provider-agnostic — the search vendor is fork-independent (SEARCH_PROVIDER).
 */

export interface ResearchResult {
  digest: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  queries: string[];
}

export async function research(queries: string[]): Promise<ResearchResult> {
  const sources: ResearchResult["sources"] = [];
  for (const q of queries.slice(0, 4)) {
    const hits = DECISIONS.searchProvider === "brave" ? await brave(q) : await tavily(q);
    sources.push(...hits);
  }
  const digest = sources.map((s) => `• ${s.title}: ${s.snippet}`).join("\n");
  return { digest, sources, queries };
}

async function tavily(query: string): Promise<ResearchResult["sources"]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: "basic" }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content?.slice(0, 300) ?? "" }));
}

async function brave(query: string): Promise<ResearchResult["sources"]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
  return (data.web?.results ?? []).slice(0, 5).map((r) => ({ title: r.title, url: r.url, snippet: r.description ?? "" }));
}
