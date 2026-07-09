"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Why isn't my pipeline converting?",
  "Which brand should I focus on this week?",
  "What are customers objecting to most?",
  "What's my best converting angle right now?",
];

export function AskChat({ ready }: { ready: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages([...next, { role: "assistant", content: data.answer }]);
      } else {
        setError(data.error ?? "failed");
      }
    } catch {
      setError("request_failed");
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md pt-8 text-center">
            <p className="text-sm text-slate-500">
              Ask anything about your business — it answers from your live brief and everything
              it&apos;s learned.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={!ready}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <p className="text-center text-xs text-red-600">
            {error === "openai_not_configured" ? "OpenAI isn't configured yet." : `Error: ${error}`}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ready ? "Ask your business…" : "Add OpenAI + generate a brief first"}
          disabled={!ready}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!ready || loading || !input.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
