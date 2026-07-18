"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import { PLATFORMS } from "@/lib/ai/draft";
import { BrandVoiceInterview } from "./BrandVoiceInterview";

interface Draft {
  platform: string;
  text: string;
}

interface Suggestion {
  topic: string;
  why: string;
  platforms: string[];
  imagePrompt: string;
}

const DEFAULT_PLATFORMS = ["instagram", "linkedin", "x"];

export function SocialComposer({
  configured,
  ghlBrands,
  imageConfigured,
  initialEntity,
  allowedBrands,
  profiledBrands,
}: {
  configured: boolean;
  ghlBrands: EntityKey[];
  imageConfigured: boolean;
  initialEntity: EntityKey;
  allowedBrands: EntityKey[];
  profiledBrands: EntityKey[];
}) {
  const brandOptions = ENTITIES.filter((e) => allowedBrands.includes(e.key));
  const [brand, setBrand] = useState<EntityKey>(initialEntity);
  const [brandVoice, setBrandVoice] = useState("");
  const [topic, setTopic] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(DEFAULT_PLATFORMS);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [originals, setOriginals] = useState<Draft[]>([]);
  const [personalised, setPersonalised] = useState(false);
  const [usedProfile, setUsedProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showInterview, setShowInterview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pubResults, setPubResults] = useState<
    { platform: string; ok: boolean; error?: string }[]
  >([]);
  const [pubError, setPubError] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [aspect, setAspect] = useState("1:1");
  const [imageFormat, setImageFormat] = useState("auto");
  const [imageDirected, setImageDirected] = useState(false);
  // The brain's suggested posts for this brand — the default starting point.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugError, setSugError] = useState<string | null>(null);
  const [sugPerformance, setSugPerformance] = useState(false);
  const [draftingIdx, setDraftingIdx] = useState<number | null>(null);
  const sugRequest = useRef(0);

  const brandName = ENTITIES.find((e) => e.key === brand)?.name ?? brand;
  const publishConfigured = ghlBrands.includes(brand);
  const hasContext = profiledBrands.includes(brand);

  async function fetchSuggestions(forBrand: EntityKey) {
    const req = ++sugRequest.current;
    setSugLoading(true);
    setSugError(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/social/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: forBrand }),
      });
      const data = await res.json();
      if (req !== sugRequest.current) return; // brand changed mid-flight
      if (data.ok) {
        setSuggestions(data.suggestions ?? []);
        setSugPerformance(Boolean(data.usedPerformance));
      } else setSugError(data.error ?? "suggest_failed");
    } catch {
      if (req === sugRequest.current) setSugError("request_failed");
    } finally {
      if (req === sugRequest.current) setSugLoading(false);
    }
  }

  // On brand change: load any manual voice override, reset, and ask the brain
  // what to post — the user starts from suggestions, not a blank page.
  useEffect(() => {
    const stored = window.localStorage.getItem(`bv:${brand}`);
    setBrandVoice(stored ?? "");
    setDrafts([]);
    setOriginals([]);
    setImageUrl(null);
    setPubResults([]);
    if (configured) void fetchSuggestions(brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, configured]);

  function saveVoice() {
    window.localStorage.setItem(`bv:${brand}`, brandVoice);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function runDraft(t: string, plats: string[]) {
    setLoading(true);
    setError(null);
    setDrafts([]);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: brand,
          topic: t,
          // Manual voice is an override; blank → the brain uses Business Context.
          brandVoice: brandVoice || undefined,
          platforms: plats,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDrafts(data.posts ?? []);
        setOriginals(data.posts ?? []);
        setPersonalised(Boolean(data.usedPreferences));
        setUsedProfile(Boolean(data.usedProfile));
        setImagePrompt((prev) => prev || t);
      } else setError(data.error ?? "draft_failed");
    } catch {
      setError("request_failed");
    } finally {
      setLoading(false);
      setDraftingIdx(null);
    }
  }

  // One click on a suggestion → drafts for its best-fit platforms.
  function draftSuggestion(s: Suggestion, idx: number) {
    const plats = s.platforms.length > 0 ? s.platforms : platforms;
    setTopic(s.topic);
    setPlatforms(plats);
    if (s.imagePrompt) setImagePrompt(s.imagePrompt);
    setDraftingIdx(idx);
    void runDraft(s.topic, plats);
  }

  function updateDraft(i: number, text: string) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, text } : d)));
  }

  // Preference capture: record what you approve / edit / reject so future drafts sharpen.
  async function sendFeedback(mode: "publish" | "reject") {
    const events = drafts.map((d, i) => {
      const original = originals[i]?.text ?? d.text;
      const action = mode === "reject" ? "reject" : original !== d.text ? "edit" : "approve";
      return { entity: brand, kind: "social", platform: d.platform, original, final: d.text, action };
    });
    if (events.length === 0) return;
    try {
      await fetch("/api/preferences/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
      });
    } catch {
      /* non-fatal — never block the user on feedback capture */
    }
  }

  function discard() {
    void sendFeedback("reject");
    setDrafts([]);
    setOriginals([]);
    setPubResults([]);
    setImageUrl(null);
  }

  async function publish() {
    setPublishing(true);
    setPubError(null);
    setPubResults([]);
    void sendFeedback("publish");
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: brand,
          posts: drafts,
          mediaUrls: imageUrl ? [imageUrl] : [],
        }),
      });
      const data = await res.json();
      if (data.results) setPubResults(data.results);
      if (!data.ok && data.error) setPubError(data.error);
    } catch {
      setPubError("request_failed");
    } finally {
      setPublishing(false);
    }
  }

  async function pollImage(id: string) {
    // Poll up to ~2.5 min; each request is short so it never hits a function timeout.
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/social/image/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.url) {
          setImageUrl(data.url);
          setImageLoading(false);
          return;
        }
        if (data.status === "failed" || data.status === "error") {
          setImageError(data.error ?? "failed");
          setImageLoading(false);
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setImageError("timeout");
    setImageLoading(false);
  }

  async function generateImage() {
    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);
    setImageDirected(false);
    try {
      const res = await fetch("/api/social/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: brand,
          concept: imagePrompt,
          // The post the image accompanies — the art director designs for it.
          postText: drafts[0]?.text || topic,
          aspect,
          format: imageFormat,
        }),
      });
      const data = await res.json();
      setImageDirected(Boolean(data.directed) || data.format === "graphic");
      if (!data.ok) {
        setImageError(data.error ?? "image_failed");
        setImageLoading(false);
        return;
      }
      if (data.url) {
        setImageUrl(data.url);
        setImageLoading(false);
        return;
      }
      if (data.id) {
        await pollImage(data.id);
        return;
      }
      setImageError("image_failed");
      setImageLoading(false);
    } catch {
      setImageError("request_failed");
      setImageLoading(false);
    }
  }

  const noContext = sugError === "no_context" || error === "no_brand_context";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* What to post — the brain suggests, you approve or edit */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Brand</label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value as EntityKey)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              {brandOptions.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <span
            className={`text-xs font-medium ${hasContext ? "text-emerald-600" : "text-amber-600"}`}
          >
            {hasContext ? "Voice: Business Context ✓" : "No business context yet"}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              ✨ What the brain suggests you post
            </h3>
            <button
              onClick={() => void fetchSuggestions(brand)}
              disabled={sugLoading || !configured}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              {sugLoading ? "Thinking…" : "More ideas ↻"}
            </button>
          </div>

          {sugLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          )}

          {!sugLoading && suggestions.length > 0 && sugPerformance && (
            <p className="text-xs text-slate-400">
              📈 Informed by real engagement on your recent posts — more of what
              worked, none of what flopped.
            </p>
          )}

          {!sugLoading && noContext && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              The brain doesn&apos;t know this business yet, so it can&apos;t suggest
              posts.{" "}
              <Link
                href="/dashboard/context"
                className="font-semibold underline hover:text-amber-900"
              >
                Add Business Context for {brandName}
              </Link>{" "}
              (2 minutes, or let AI draft it) and suggestions appear here automatically.
            </div>
          )}

          {!sugLoading && sugError && !noContext && (
            <p className="text-xs text-red-600">
              {sugError === "openai_not_configured"
                ? "OpenAI isn't configured yet."
                : `Couldn't fetch suggestions: ${sugError}`}
            </p>
          )}

          {!sugLoading &&
            suggestions.map((s, i) => (
              <div
                key={`${s.topic}-${i}`}
                className="rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-slate-300"
              >
                <p className="text-sm font-medium text-slate-800">{s.topic}</p>
                {s.why && <p className="mt-0.5 text-xs text-slate-500">{s.why}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(s.platforms.length ? s.platforms : DEFAULT_PLATFORMS).map((p) => (
                      <span
                        key={p}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-500"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => draftSuggestion(s, i)}
                    disabled={loading || !configured}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loading && draftingIdx === i ? "Drafting…" : "Draft this →"}
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* Manual path — optional, for when you already know what you want to say */}
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900">
            Write your own topic instead
          </summary>
          <div className="space-y-3 border-t border-slate-100 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Topic</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Why we built our AI operating system"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Platforms
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                        on
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={() => void runDraft(topic, platforms)}
              disabled={loading || !configured || !topic || platforms.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading && draftingIdx === null ? "Drafting…" : "Draft with AI"}
            </button>
          </div>
        </details>

        {/* Voice override — optional; by default the voice comes from Business Context */}
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900">
            Voice override (optional)
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Leave blank to use the {brandName} Business Context profile — recommended.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowInterview(true)}
                  disabled={!configured || showInterview}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40"
                >
                  ✨ Build with AI
                </button>
                <button
                  onClick={saveVoice}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  {saved ? "Saved ✓" : "Save"}
                </button>
              </div>
            </div>
            {showInterview && (
              <div className="mb-2">
                <BrandVoiceInterview
                  brandName={brandName}
                  onComplete={(v) => {
                    setBrandVoice(v);
                    window.localStorage.setItem(`bv:${brand}`, v);
                    setShowInterview(false);
                  }}
                  onCancel={() => setShowInterview(false)}
                />
              </div>
            )}
            <textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={5}
              placeholder="Only fill this to override the profile: who you are, audience, tone, phrases, offers/CTAs…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </details>

        {!configured && (
          <p className="text-xs text-amber-600">
            Add <code>OPENAI_API_KEY</code> to enable AI drafting.
          </p>
        )}
        {error && error !== "no_brand_context" && (
          <p className="text-xs text-red-600">
            {error === "openai_not_configured"
              ? "OpenAI isn't configured yet."
              : `Error: ${error}`}
          </p>
        )}
        {error === "no_brand_context" && (
          <p className="text-xs text-amber-600">
            The brain has no context for {brandName} yet —{" "}
            <Link href="/dashboard/context" className="font-semibold underline">
              add Business Context
            </Link>{" "}
            or set a voice override above.
          </p>
        )}
      </div>

      {/* Previews — approve, edit or discard */}
      <div className="space-y-3">
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            Pick a suggestion on the left — drafts appear here, tailored per
            platform. Tweak any of them before publishing; your edits teach the
            brain your style.
          </div>
        ) : (
          <>
            {(personalised || usedProfile) && (
              <div className="rounded-lg bg-slate-900/5 px-3 py-1.5 text-xs font-medium text-slate-600">
                {usedProfile && <>✨ Written in your voice — from {brandName}&apos;s Business Context. </>}
                {personalised && <>Tailored to your style, learned from what you approve and edit.</>}
              </div>
            )}
            {drafts.map((d, i) => {
              const edited = Boolean(originals[i] && originals[i].text !== d.text);
              return (
                <div key={d.platform} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {d.platform}
                    </span>
                    {edited && (
                      <span className="text-[10px] font-medium text-amber-600">edited ✎</span>
                    )}
                  </div>
                  <textarea
                    value={d.text}
                    onChange={(e) => updateDraft(i, e.target.value)}
                    rows={5}
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              );
            })}
          </>
        )}
        {drafts.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">Image (optional)</h4>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "auto", label: "✨ Auto" },
                { key: "graphic", label: "Branded graphic" },
                { key: "photo", label: "Photo" },
                { key: "illustration", label: "Illustration" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setImageFormat(f.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    imageFormat === f.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={2}
              placeholder="Describe the image / carousel cover…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
            <button
              onClick={generateImage}
              disabled={imageLoading || !imagePrompt || (!imageConfigured && imageFormat !== "graphic")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {imageLoading ? "Generating…" : "Generate image"}
            </button>
            {imageDirected && !imageLoading && imageUrl && (
              <p className="text-xs text-slate-400">
                🎨 Art-directed by the brain from this post + your brand&apos;s visual
                identity (set it in Business Context → &ldquo;Visual style&rdquo;).
              </p>
            )}
            {!imageConfigured && (
              <p className="text-xs text-amber-600">
                Add <code>HIGGSFIELD_API_KEY</code> to generate images.
              </p>
            )}
            {imageError && <p className="text-xs text-red-600">Error: {imageError}</p>}
            {imageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Generated"
                  className="mt-1 w-full rounded-lg border border-slate-200"
                />
                <p className="text-xs text-slate-400">
                  Attached to the posts on publish — this enables Instagram, TikTok,
                  YouTube and Pinterest.
                </p>
              </>
            )}
          </div>
        )}

        {drafts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={publish}
                disabled={publishing || !publishConfigured}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Approve & publish"}
              </button>
              <button
                onClick={discard}
                disabled={publishing}
                title="Discard these drafts — the brain learns from what you reject"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Publishing an edited draft, or discarding one, teaches the brain your
              style for next time.
            </p>
            {!publishConfigured && (
              <p className="text-xs text-amber-600">
                Connect GoHighLevel for {brandName} (token + location) to publish.
                Text posts suit Facebook, LinkedIn, X and Google; image-required
                platforms (Instagram, TikTok, YouTube, Pinterest) need the images
                step. Threads/Bluesky aren&apos;t supported by GHL.
              </p>
            )}
            {pubError && pubError !== "blotato_not_configured" && (
              <p className="text-xs text-red-600">Error: {pubError}</p>
            )}
            {pubResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pubResults.map((r) => (
                  <span
                    key={r.platform}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.platform}: {r.ok ? "posted" : (r.error ?? "failed")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
