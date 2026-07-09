"use client";

import { useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
function fieldOf(item: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = item?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

export function ResearchPanel({ apifyConfigured }: { apifyConfigured: boolean }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const res = await fetch("/api/marketing/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.ok) setItems(data.items ?? []);
      else setError(data.error ?? "research_failed");
    } catch {
      setError("request_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">Market &amp; lead research</h3>
      <p className="mt-1 text-sm text-slate-500">
        Powered by Apify. Search a niche, place or competitor to pull structured
        results.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. plumbers in Cambridge"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <button
          onClick={run}
          disabled={loading || !apifyConfigured || !query}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Researching…" : "Research"}
        </button>
      </div>

      {!apifyConfigured && (
        <p className="mt-2 text-xs text-amber-600">
          Add <code>APIFY_TOKEN</code> (+ optional <code>APIFY_ACTOR_ID</code>) to enable research.
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">
          {error === "apify_not_configured" ? "Apify isn't configured yet." : `Error: ${error}`}
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-400">{items.length} result(s)</p>
          {items.map((it, i) => {
            const title = fieldOf(it, ["title", "name", "companyName", "businessName"]) ?? `Result ${i + 1}`;
            const url = fieldOf(it, ["url", "website", "link", "domain"]);
            const sub = fieldOf(it, ["address", "description", "category", "phone"]);
            return (
              <div key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="text-sm font-medium text-slate-800">{title}</div>
                {sub && <div className="text-xs text-slate-500">{sub}</div>}
                {url && (
                  <a
                    href={url.startsWith("http") ? url : `https://${url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    {url}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
