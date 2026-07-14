"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

const STARTERS = [
  "Give me a subscriber-level MRR breakdown",
  "What are my biggest open deals right now?",
  "What's my profit over the last 12 months?",
  "What are customers objecting to most?",
];

/** Map the tools the model called to friendly, de-duplicated source labels. */
const SOURCE_LABEL: Record<string, string> = {
  get_revenue: "Stripe",
  list_subscriptions: "Stripe subscriptions",
  get_pipeline: "GHL pipeline",
  list_top_deals: "GHL deals",
  get_accounting: "Xero / QuickBooks",
  get_marketing: "Facebook Ads + GHL",
  search_knowledge: "Learned insights",
  get_daily_brief: "Daily brief",
};
function sourceLabels(tools?: string[]): string[] {
  if (!Array.isArray(tools)) return [];
  return [...new Set(tools.map((t) => SOURCE_LABEL[t] ?? t))];
}

interface BrandOpt {
  key: string;
  name: string;
}

export function AskChat({
  ready,
  brands = [],
  canTeach = false,
}: {
  ready: boolean;
  brands?: BrandOpt[];
  canTeach?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // "Teach the brain" — durable corrections it always applies.
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachText, setTeachText] = useState("");
  const [teachBrand, setTeachBrand] = useState("all");
  const [teachSaved, setTeachSaved] = useState(false);
  const [teachBusy, setTeachBusy] = useState(false);

  async function teach() {
    if (!teachText.trim() || teachBusy) return;
    setTeachBusy(true);
    setTeachSaved(false);
    try {
      const res = await fetch("/api/brain/teach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: teachText.trim(), entity: teachBrand }),
      });
      const data = await res.json();
      if (data.ok) {
        setTeachSaved(true);
        setTeachText("");
      }
    } finally {
      setTeachBusy(false);
    }
  }

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
        setMessages([
          ...next,
          { role: "assistant", content: data.answer, sources: sourceLabels(data.toolsUsed) },
        ]);
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
    <>
    <div className="flex h-[calc(100vh-13rem)] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md pt-8 text-center">
            <p className="text-sm text-slate-500">
              Ask anything about your business — it pulls live numbers from Stripe, your pipeline
              and your accounts, plus everything it&apos;s learned from calls and emails.
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
              <div className={m.role === "user" ? "max-w-[80%]" : "max-w-[80%] space-y-1"}>
                <div
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <p className="px-1 text-[11px] text-slate-400">
                    Live sources: {m.sources.join(" · ")}
                  </p>
                )}
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

    {canTeach && (
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
        {!teachOpen ? (
          <button
            onClick={() => setTeachOpen(true)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            + Teach the brain a fact (so it stops getting something wrong)
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">
                Teach the brain a durable fact
              </p>
              <button
                onClick={() => setTeachOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                close
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              It always applies these — use for things it can&apos;t compute, e.g. &quot;exclude
              yibo@ and chao@ as test accounts&quot; or &quot;trust paid invoices over the Xero
              P&amp;L&quot;.
            </p>
            <textarea
              value={teachText}
              onChange={(e) => {
                setTeachText(e.target.value);
                setTeachSaved(false);
              }}
              rows={2}
              placeholder="Tell the brain a fact or correction…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
            <div className="flex items-center gap-2">
              <select
                value={teachBrand}
                onChange={(e) => setTeachBrand(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600 outline-none"
              >
                <option value="all">All companies</option>
                {brands.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                onClick={teach}
                disabled={teachBusy || !teachText.trim()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {teachBusy ? "Saving…" : "Teach"}
              </button>
              {teachSaved && <span className="text-xs text-emerald-600">Learned ✓</span>}
            </div>
          </div>
        )}
      </div>
    )}
    </>
  );
}
