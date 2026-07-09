"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CredField {
  name: string;
  label: string;
  kind: "secret" | "text";
  placeholder?: string;
}
export interface CredGroup {
  title: string;
  fields: CredField[];
}

export function CredentialsForm({
  groups,
  status,
  storeAvailable,
}: {
  groups: CredGroup[];
  status: Record<string, boolean>;
  storeAvailable: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
    setSaved(false);
  }

  async function save() {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) if (v && v.trim()) payload[k] = v.trim();
    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: payload }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setValues({});
        router.refresh();
      } else {
        setError(data.error ?? "save_failed");
      }
    } catch {
      setError("request_failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {!storeAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Connect Supabase first to save from here.</p>
          <p className="mt-1">
            Credentials are stored in your database. Add your Supabase keys and run
            the migrations (see <code>SETUP.md</code>). Until then you can still use{" "}
            <code>.env.local</code>.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.title} className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{g.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.name}>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600">
                  {f.label}
                  {status[f.name] && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      set
                    </span>
                  )}
                </label>
                <input
                  type={f.kind === "secret" ? "password" : "text"}
                  autoComplete="off"
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={
                    status[f.name] ? "•••••••• (leave blank to keep)" : f.placeholder ?? "Not set"
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !storeAvailable}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save credentials"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
        {error && <span className="text-sm text-red-600">Error: {error}</span>}
      </div>
      <p className="text-xs text-slate-400">
        After saving, open <strong>Connected apps</strong> to confirm the green
        badges. Changes take effect within a few seconds.
      </p>
    </div>
  );
}
