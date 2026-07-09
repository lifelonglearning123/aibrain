"use client";

import { useState } from "react";

interface Result {
  ok: boolean;
  status: number;
  queued?: boolean;
  error?: string;
}

export function EnrollTester({ configured }: { configured: boolean }) {
  const [goalId, setGoalId] = useState("");
  const [contactId, setContactId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">
        Test the connection
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Enrol a single contact into a Goal Engine goal to prove the plug works
        end-to-end. {configured ? "" : "Add Goal Engine's URL + enrol secret to enable."}
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            placeholder="Goal Engine goalId"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          <input
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            placeholder="GHL contactId"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
        </div>
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
