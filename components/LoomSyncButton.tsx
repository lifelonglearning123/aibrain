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
    setMsg("Starting…");
    let total = 0;
    try {
      // Loop small batches until nothing new — backfills the whole history
      // without any single request hitting the serverless time limit.
      for (let i = 0; i < 40; i++) {
        const res = await fetch("/api/loom/sync", { method: "POST" });
        if (!res.ok) {
          // A batch timed out server-side; ingested items are saved (deduped).
          setMsg(
            total > 0
              ? `Ingested ${total} so far — a batch timed out. Click Sync again to continue.`
              : "That timed out — click Sync again to continue.",
          );
          break;
        }
        const data = await res.json();
        if (!data.ok) {
          setMsg(
            data.error === "no_recaps_or_not_connected"
              ? "No recaps found — is Gmail connected above?"
              : `Error: ${data.error}`,
          );
          break;
        }
        total += data.added;
        if (data.added === 0) {
          setMsg(`Done — ${total} new recap${total === 1 ? "" : "s"} ingested. All caught up.`);
          break;
        }
        setMsg(`Ingesting… ${total} recaps so far.`);
      }
      router.refresh();
    } catch {
      setMsg(
        total > 0
          ? `Ingested ${total} so far — click Sync again to continue.`
          : "Request failed — click Sync again to continue.",
      );
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
