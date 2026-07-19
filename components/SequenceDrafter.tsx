"use client";

import { useState } from "react";
import { ENTITIES, type EntityKey } from "@/lib/entities";

interface Step {
  day: number;
  channel: string;
  kind?: "value" | "sales";
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

  const valueCount = steps.filter((s) => s.kind !== "sales").length;
  const salesCount = steps.length - valueCount;

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
        Draft a 30-day, benefit-led retargeting campaign
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        gpt-5.5 writes a 30-day nurture campaign that mostly <strong>gives value</strong> (~80%) and
        only occasionally sells (~20%), grounded in verified AI-voice benefit facts and your learned
        insights. Review it, then set it up in Goal Engine.
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              {steps.length} steps over 30 days · {valueCount} value / {salesCount} sales
              {steps.length ? ` (${Math.round((valueCount / steps.length) * 100)}% value)` : ""}
            </span>
            <span>
              {usedInsights
                ? "Grounded in your learned insights + verified benefit facts."
                : "General best practice used — run learning in AI Insights to sharpen this."}
            </span>
          </div>
          {steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    s.kind === "sales"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {s.kind === "sales" ? "Sales" : "Value"}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Day {s.day} · {s.channel}
                  {s.subject ? ` · ${s.subject}` : ""}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{s.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
