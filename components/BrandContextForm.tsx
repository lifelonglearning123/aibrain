"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  type BrandProfile,
} from "@/lib/brand-profile";
import { VOICE_INFLUENCES } from "@/lib/voice-influences";

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
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const current = profiles[active] ?? {};
  const pct = useMemo(() => completeness(current), [current]);

  function set(key: Exclude<keyof BrandProfile, "voiceInfluences">, value: string) {
    setProfiles((prev) => ({ ...prev, [active]: { ...prev[active], [key]: value } }));
    setSaved(false);
  }

  const selectedInfluences = current.voiceInfluences ?? [];
  function toggleInfluence(key: string) {
    const next = selectedInfluences.includes(key)
      ? selectedInfluences.filter((k) => k !== key)
      : [...selectedInfluences, key];
    setProfiles((prev) => ({ ...prev, [active]: { ...prev[active], voiceInfluences: next } }));
    setSaved(false);
  }

  // AI drafts the profile from what the brain already knows; fills only the BLANK
  // fields so it never clobbers what you've written. You then improve + save.
  async function draftWithAI() {
    if (drafting) return;
    setDrafting(true);
    setDraftNote(null);
    setError(null);
    try {
      const res = await fetch("/api/context/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: active }),
      });
      const data = await res.json();
      if (data.ok && data.profile) {
        let filled = 0;
        setProfiles((prev) => {
          const cur = { ...prev[active] };
          for (const f of PROFILE_FIELDS) {
            const draftVal = (data.profile as BrandProfile)[f.key];
            if (draftVal && !(cur[f.key] ?? "").trim()) {
              cur[f.key] = draftVal;
              filled += 1;
            }
          }
          return { ...prev, [active]: cur };
        });
        setSaved(false);
        setDraftNote(
          filled > 0
            ? `AI drafted ${filled} field${filled === 1 ? "" : "s"} from your data — including a voice sample pulled from your own sent messages. Review, tweak (or optionally pick a voice influence below), then Save.`
            : "Nothing new to draft — your fields are already filled.",
        );
      } else {
        setError(
          data.error === "not_enough_evidence"
            ? "Not enough data learned about this business yet to draft it."
            : data.error ?? "draft_failed",
        );
      }
    } catch {
      setError("request_failed");
    } finally {
      setDrafting(false);
    }
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

      {/* AI draft + completeness */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={draftWithAI}
          disabled={drafting}
          className="rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {drafting ? "Drafting from your data…" : "✨ Draft with AI"}
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500">{pct}% complete</span>
      </div>
      {draftNote && <p className="-mt-1 text-xs text-slate-500">{draftNote}</p>}
      {pct === 0 && !drafting && !draftNote && (
        <p className="-mt-1 text-xs text-slate-400">
          Don&apos;t start from blank — hit <strong>Draft with AI</strong> and it&apos;ll fill this
          in from everything the brain has already learned. You just improve it.
        </p>
      )}

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

      {/* Voice influences — borrow a well-known entrepreneur's style */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Voice influences</h3>
        <p className="mb-3 text-xs text-slate-500">
          Optional — borrow the communication style of a well-known entrepreneur. Your brand&apos;s
          own voice stays in charge; these just add flavour to drafts. Hover for each style.
        </p>
        <div className="flex flex-wrap gap-2">
          {VOICE_INFLUENCES.map((v) => {
            const on = selectedInfluences.includes(v.key);
            return (
              <button
                key={v.key}
                onClick={() => toggleInfluence(v.key)}
                title={v.style}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  on
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {v.name} <span className={on ? "text-slate-300" : "text-slate-400"}>· {v.tagline}</span>
              </button>
            );
          })}
        </div>
        <label className="mb-1 mt-4 block text-xs font-medium text-slate-600">
          Or add your own reference
        </label>
        <textarea
          value={current.customVoice ?? ""}
          onChange={(e) => set("customVoice", e.target.value)}
          rows={2}
          placeholder="e.g. 'Daniel Priestley meets our founder — British, credible, a bit cheeky.' Or paste a paragraph by someone whose style you like."
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
      </div>

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
