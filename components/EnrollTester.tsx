"use client";

import { useCallback, useEffect, useState } from "react";
import { ENTITIES, type EntityKey } from "@/lib/entities";

interface Result {
  ok: boolean;
  status: number;
  queued?: boolean;
  error?: string;
}

interface Goal {
  id: string;
  prompt: string;
  status: string;
}

export function EnrollTester({
  configured,
  initialEntity,
  allowedBrands,
}: {
  configured: boolean;
  initialEntity: EntityKey;
  allowedBrands: EntityKey[];
}) {
  const brandOptions = ENTITIES.filter((e) => allowedBrands.includes(e.key));
  const [brand, setBrand] = useState<EntityKey>(initialEntity);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalId, setGoalId] = useState("");
  const [manual, setManual] = useState(false);
  const [contactId, setContactId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const loadGoals = useCallback(async () => {
    if (!configured) return;
    setGoalsLoading(true);
    setGoalsError(null);
    setGoals([]);
    setGoalId("");
    try {
      const res = await fetch(`/api/retargeting/goals?entity=${encodeURIComponent(brand)}`);
      const data = await res.json();
      if (data.ok) {
        setGoals(data.goals ?? []);
        if ((data.goals ?? []).length === 0) setManual(true);
      } else {
        setGoalsError(data.error ?? "failed");
        setManual(true);
      }
    } catch {
      setGoalsError("request_failed");
      setManual(true);
    } finally {
      setGoalsLoading(false);
    }
  }, [brand, configured]);

  useEffect(() => {
    void loadGoals();
    setResult(null);
  }, [loadGoals]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/integrations/goal-engine/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId, contactId }),
      });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, status: 0, error: "request_failed" });
    } finally {
      setLoading(false);
    }
  }

  const goalLabel = (g: Goal) =>
    `${g.status === "active" ? "● " : "○ "}${g.prompt.slice(0, 70)}${g.prompt.length > 70 ? "…" : ""}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">Enrol a contact</h3>
      <p className="mt-1 text-sm text-slate-500">
        Pick one of this brand&apos;s Goal Engine goals and enrol a GHL contact into it — the flow
        plans and runs in the background.{" "}
        {configured ? "" : "Connect Goal Engine (URL + enrol secret) to enable."}
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
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
          {goalsLoading && <span className="text-xs text-slate-400">Loading goals…</span>}
          {!goalsLoading && goals.length > 0 && (
            <span className="text-xs text-slate-400">
              {goals.length} goal{goals.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Goal picker — dropdown of real goals, with a manual fallback. */}
        {manual ? (
          <div className="space-y-1">
            <input
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              placeholder="Goal Engine goalId"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
            <p className="text-xs text-slate-400">
              {goalsError === "no_ghl_location"
                ? "No GHL location set for this brand — enter a goalId manually."
                : goalsError
                  ? `Couldn't load goals (${goalsError}) — enter a goalId manually.`
                  : "No goals found for this brand."}{" "}
              {goals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManual(false)}
                  className="font-medium text-slate-600 underline"
                >
                  Use the list instead
                </button>
              )}
            </p>
          </div>
        ) : (
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          >
            <option value="">Select a goal…</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {goalLabel(g)}
              </option>
            ))}
          </select>
        )}

        <input
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          placeholder="GHL contactId (the person to enrol)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <button
          type="submit"
          disabled={loading || !configured || !goalId || !contactId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Enrolling…" : "Enrol contact"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.ok
            ? `Queued in Goal Engine (status ${result.status}). Planning runs in the background.`
            : `Failed: ${result.error ?? "unknown"} (status ${result.status})`}
        </div>
      )}
    </div>
  );
}
