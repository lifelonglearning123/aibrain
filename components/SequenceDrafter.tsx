"use client";

import { useState } from "react";
import { ENTITIES, type EntityKey } from "@/lib/entities";

interface Step {
  day: number;
  channel: string;
  subject?: string;
  message: string;
}

export function SequenceDrafter({
  openaiConfigured,
  initialEntity,
  allowedBrands,
}: {
  openaiConfigured: boolean;
  initialEntity: EntityKey;
  allowedBrands: EntityKey[];
}) {
  const [brand, setBrand] = useState<EntityKey>(initialEntity);
  const brandOptions = ENTITIES.filter((e) => allowedBrands.includes(e.key));
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedInsights, setUsedInsights] = useState(false);

  async function draft() {
    setLoading(true);
    setError(null);
    setSteps([]);
    try {
      const res = await fetch("/api/retargeting/draft-sequence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: brand, goal }),
      });
      const data = await res.json();
      if (data.ok) {
        setSteps(data.steps ?? []);
        setUsedInsights(Boolean(data.usedInsights));
      } else setError(data.error ?? "failed");
    } catch {
      setError("request_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">
        Draft a retargeting sequence from what we&apos;ve learned
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        gpt-5.5 writes a multi-step sequence that handles the real objections from your calls.
        Review it, then set it up as a goal in Goal Engine.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value as EntityKey)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          {brandOptions.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Goal — e.g. book a demo call"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <button
          onClick={draft}
          disabled={loading || !openaiConfigured || !goal}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Drafting…" : "Draft sequence"}
        </button>
      </div>

      {!openaiConfigured && (
        <p className="mt-2 text-xs text-amber-600">Add OpenAI to enable drafting.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">Error: {error}</p>}

      {steps.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-400">
            {usedInsights
              ? "Grounded in your learned insights."
              : "No learned insights yet — general best practice used. Run learning in AI Insights to improve this."}
          </p>
          {steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Day {s.day} · {s.channel}
                {s.subject ? ` · ${s.subject}` : ""}
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{s.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
