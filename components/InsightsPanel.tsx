"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InsightsPanel({
  entity,
  canLearn,
  signalConnected,
}: {
  entity: string;
  canLearn: boolean;
  signalConnected: boolean;
}) {
  const router = useRouter();
  const [learning, setLearning] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runLearning() {
    setLearning(true);
    setMsg(null);
    try {
      const res = await fetch("/api/insights/learn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg(
          `Learned from ${data.callsSeen} calls → ${data.sharedInsights} shared + ${data.brandInsights} brand insights.`,
        );
        router.refresh();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch {
      setMsg("Request failed");
    } finally {
      setLearning(false);
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    setMsg(null);
    try {
      const res = await fetch("/api/insights/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, text: note }),
      });
      const data = await res.json();
      if (data.ok) {
        setNote("");
        setMsg("Note saved — run learning to fold it in.");
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch {
      setMsg("Request failed");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">Run learning</h3>
        <p className="mt-1 text-sm text-slate-500">
          Pulls anonymised insights from Signal calls, GoHighLevel emails/SMS (marking
          won-deal contacts as converting) and your notes.
        </p>
        <button
          onClick={runLearning}
          disabled={learning || !canLearn}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {learning ? "Learning…" : "Run learning now"}
        </button>
        {!canLearn && (
          <p className="mt-2 text-xs text-amber-600">
            Needs OpenAI + Supabase configured.
          </p>
        )}
        {canLearn && !signalConnected && (
          <p className="mt-2 text-xs text-amber-600">
            Connect Signal (Settings) to learn from calls — notes still work.
          </p>
        )}
        {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">Teach the brain</h3>
        <p className="mt-1 text-sm text-slate-500">
          Type anything you&apos;ve noticed (a winning angle, a common objection). It&apos;s
          remembered for this brand.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Prospects keep asking if setup is included…"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <button
          onClick={saveNote}
          disabled={savingNote || !note.trim()}
          className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {savingNote ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  );
}
