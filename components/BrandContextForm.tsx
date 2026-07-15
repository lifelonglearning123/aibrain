"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  type BrandProfile,
} from "@/lib/brand-profile";

interface BrandOpt {
  key: string;
  name: string;
}

/** How complete a profile is (0–100) — nudges the user to fill it in. */
function completeness(p: BrandProfile): number {
  const filled = PROFILE_FIELDS.filter((f) => (p[f.key] ?? "").trim()).length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

export function BrandContextForm({
  brands,
  initialProfiles,
}: {
  brands: BrandOpt[];
  initialProfiles: Record<string, BrandProfile>;
}) {
  const router = useRouter();
  const [active, setActive] = useState(brands[0]?.key ?? "");
  const [profiles, setProfiles] = useState<Record<string, BrandProfile>>(() => {
    const seed: Record<string, BrandProfile> = {};
    for (const b of brands) seed[b.key] = { ...(initialProfiles[b.key] ?? {}) };
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = profiles[active] ?? {};
  const pct = useMemo(() => completeness(current), [current]);

  function set(key: keyof BrandProfile, value: string) {
    setProfiles((prev) => ({ ...prev, [active]: { ...prev[active], [key]: value } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/context/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: active, profile: current }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
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
    <div className="space-y-4">
      {/* Brand tabs */}
      {brands.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => {
            const bPct = completeness(profiles[b.key] ?? {});
            return (
              <button
                key={b.key}
                onClick={() => {
                  setActive(b.key);
                  setSaved(false);
                  setError(null);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  active === b.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {b.name}
                <span
                  className={`ml-2 text-[10px] ${active === b.key ? "text-slate-300" : "text-slate-400"}`}
                >
                  {bPct}%
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Completeness bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500">{pct}% complete</span>
      </div>

      {/* Fields grouped */}
      {PROFILE_GROUPS.map((group) => (
        <div key={group} className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{group}</h3>
          <div className="space-y-4">
            {PROFILE_FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
                <textarea
                  value={current[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  rows={f.rows}
                  placeholder={f.hint}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${brands.find((b) => b.key === active)?.name ?? ""} context`}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved ✓ — the brain now knows this.</span>}
        {error && <span className="text-sm text-red-600">Error: {error}</span>}
      </div>
    </div>
  );
}
