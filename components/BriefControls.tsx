"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BriefControls({ canGenerate }: { canGenerate: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/brief/generate", { method: "POST" });
      const data = await res.json();
      if (data.ok) router.refresh();
      else setErr(data.error ?? "failed");
    } catch {
      setErr("request_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <button
        onClick={generate}
        disabled={loading || !canGenerate}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Generating… (~30s)" : "Generate now"}
      </button>
    </div>
  );
}
