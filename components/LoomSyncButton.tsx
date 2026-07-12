"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Owner-only: manually pull new Loom recaps from Gmail (backfill / on-demand). */
export function LoomSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/loom/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMsg(
          data.added > 0
            ? `Ingested ${data.added} new recap${data.added === 1 ? "" : "s"} (${data.skipped} already in). Run again to fetch more of the backlog.`
            : `Up to date — nothing new (${data.skipped} already ingested).`,
        );
        router.refresh();
      } else {
        setMsg(
          data.error === "no_recaps_or_not_connected"
            ? "No recaps found — is Gmail connected above?"
            : `Error: ${data.error}`,
        );
      }
    } catch {
      setMsg("Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={sync}
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync Loom recaps now"}
      </button>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
