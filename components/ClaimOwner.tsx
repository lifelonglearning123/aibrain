"use client";

import { useState } from "react";

/** Shown on the no-access screen when the system has no owner yet. */
export function ClaimOwner({ email }: { email: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/claim", { method: "POST" });
      const data = await res.json();
      if (data.ok) window.location.reload();
      else setError(data.error ?? "Could not claim ownership");
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
      <p className="text-sm text-slate-600">
        No owner is set up yet. As the first person here, you can claim this as the
        master owner account{email ? <> (<strong>{email}</strong>)</> : null} — you&apos;ll
        get full access to every company and can invite partners.
      </p>
      <button
        onClick={claim}
        disabled={loading}
        className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Claiming…" : "Claim owner account"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600">
          {error === "owner_already_exists"
            ? "An owner already exists — ask them to invite you."
            : error}
        </p>
      )}
    </div>
  );
}
