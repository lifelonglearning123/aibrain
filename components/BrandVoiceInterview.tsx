"use client";

import { useEffect, useRef, useState } from "react";

interface Turn {
  question: string;
  answer: string;
}

export function BrandVoiceInterview({
  brandName,
  onComplete,
  onCancel,
}: {
  brandName: string;
  onComplete: (brandVoice: string) => void;
  onCancel: () => void;
}) {
  const [history, setHistory] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function step(nextHistory: Turn[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/brand-voice/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandName, history: nextHistory }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "failed");
      } else if (data.mode === "complete") {
        onComplete(data.brandVoice ?? "");
      } else {
        setQuestion(data.question ?? "…");
      }
    } catch {
      setError("request_failed");
    } finally {
      setLoading(false);
    }
  }

  // Fetch the first question once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    step([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    if (!question || !answer.trim()) return;
    const next = [...history, { question, answer: answer.trim() }];
    setHistory(next);
    setAnswer("");
    setQuestion(null);
    step(next);
  }

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">
          Brand-voice interview · {brandName}
        </h4>
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-700">
          Cancel
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        Answer {history.length + 1} · gpt-5.5 asks one question at a time, then writes
        your brand voice.
      </p>

      {error ? (
        <p className="text-sm text-red-600">
          {error === "openai_not_configured"
            ? "OpenAI isn't configured yet — add OPENAI_API_KEY."
            : `Error: ${error}`}
        </p>
      ) : loading ? (
        <p className="text-sm text-slate-500">
          {history.length === 0 ? "Starting…" : "Thinking…"}
        </p>
      ) : question ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">{question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            placeholder="Your answer…"
          />
          <button
            onClick={submit}
            disabled={!answer.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
