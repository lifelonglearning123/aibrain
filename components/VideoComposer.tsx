"use client";

import { useState } from "react";
import { ENTITIES, type EntityKey } from "@/lib/entities";

type SceneStatus = "idle" | "generating" | "ready" | "error";

interface Scene {
  id: string;
  source: "ai" | "user";
  prompt: string;
  clipUrl: string;
  jobId?: string;
  status: SceneStatus;
  error?: string;
  /** True once the brain art-directed this clip from the brand + topic. */
  directed?: boolean;
  /** Real clip length (s), read from the preview — used to trim end-drift. */
  duration?: number;
}

// AI video models drift in the last ~1.5s of a clip (dop-preview blooms/zooms;
// dop-turbo adds a foreign object). Trim that tail off AI clips on assembly.
const AI_TAIL_TRIM_S = 1.5;

const VIDEO_PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "x", "linkedin"];
const TTS_VOICES = ["onyx", "alloy", "echo", "fable", "nova", "shimmer"];

export function VideoComposer({
  aiConfigured,
  renderConfigured,
  ghlBrands,
  initialEntity,
  allowedBrands,
}: {
  aiConfigured: boolean;
  renderConfigured: boolean;
  ghlBrands: EntityKey[];
  initialEntity: EntityKey;
  allowedBrands: EntityKey[];
}) {
  const [brand, setBrand] = useState<EntityKey>(initialEntity);
  const brandOptions = ENTITIES.filter((e) => allowedBrands.includes(e.key));
  const [aspect, setAspect] = useState("9:16");
  // What the video is about — gives the art director the narrative context so
  // each clip's still is grounded in the post, not a bare scene description.
  const [topic, setTopic] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);

  // Storyboard (auto-build scenes) — the length lever.
  const [targetSeconds, setTargetSeconds] = useState(24);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);

  // Voiceover — the audio lever.
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("onyx");
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Assembly
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);

  // Publish
  const [caption, setCaption] = useState("");
  const [vidPlatforms, setVidPlatforms] = useState<string[]>(["instagram", "tiktok"]);
  const [publishing, setPublishing] = useState(false);
  const [pubResults, setPubResults] = useState<{ platform: string; ok: boolean; error?: string }[]>([]);
  const [pubError, setPubError] = useState<string | null>(null);

  const publishConfigured = ghlBrands.includes(brand);

  function update(id: string, patch: Partial<Scene>) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addScene(source: "ai" | "user") {
    setScenes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), source, prompt: "", clipUrl: "", status: "idle" },
    ]);
  }
  function remove(id: string) {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setScenes((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function pollClip(id: string, jobId: string) {
    for (let i = 0; i < 75; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const res = await fetch(`/api/video/clip/status?id=${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (data.url) return update(id, { clipUrl: data.url, status: "ready" });
        // Only an explicit failure ends it — "pending"/transport errors keep polling.
        if (["failed", "nsfw", "cancelled", "canceled"].includes(data.status)) {
          return update(id, { status: "error", error: data.error ?? "failed" });
        }
      } catch {
        /* keep polling */
      }
    }
    update(id, { status: "error", error: "timeout" });
  }

  async function generate(scene: Scene) {
    update(scene.id, { status: "generating", error: undefined });
    try {
      const res = await fetch("/api/video/clip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send the brand + topic so the clip is art-directed in the brand's
        // look (not a raw prompt). The scene text is the shot concept.
        body: JSON.stringify({
          entity: brand,
          concept: scene.prompt,
          postText: topic || undefined,
          aspect,
        }),
      });
      const data = await res.json();
      if (!data.ok) return update(scene.id, { status: "error", error: data.error ?? "failed" });
      if (data.url) {
        return update(scene.id, { clipUrl: data.url, status: "ready", directed: data.directed });
      }
      if (data.id) {
        update(scene.id, { jobId: data.id, directed: data.directed });
        pollClip(scene.id, data.id);
      }
    } catch {
      update(scene.id, { status: "error", error: "request_failed" });
    }
  }

  async function pollRender(id: string) {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const res = await fetch(`/api/video/render/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        setRenderStatus(data.status ?? null);
        if (data.url) {
          setFinalUrl(data.url);
          setRendering(false);
          return;
        }
        if (data.status === "failed" || data.status === "error") {
          setRenderError(data.error ?? "render_failed");
          setRendering(false);
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setRenderError("timeout");
    setRendering(false);
  }

  // Auto-build a storyboard: the brain writes a narration split into beats and
  // turns each beat into an AI scene — this is how the video gets longer.
  async function buildStoryboard() {
    if (!topic.trim()) return;
    setSbLoading(true);
    setSbError(null);
    try {
      const res = await fetch("/api/video/storyboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: brand, topic, targetSeconds }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSbError(data.error ?? "storyboard_failed");
        return;
      }
      const beats: { vo: string; shotConcept: string }[] = data.beats ?? [];
      setScenes(
        beats.map((b) => ({
          id: crypto.randomUUID(),
          source: "ai" as const,
          prompt: b.shotConcept,
          clipUrl: "",
          status: "idle" as SceneStatus,
        })),
      );
      // The joined narration becomes the voiceover script (editable below).
      setScript(String(data.script ?? beats.map((b) => b.vo).join(" ")));
      setVoiceoverUrl(null);
    } catch {
      setSbError("request_failed");
    } finally {
      setSbLoading(false);
    }
  }

  async function generateVoiceover() {
    if (!script.trim()) return;
    setVoiceLoading(true);
    setVoiceError(null);
    setVoiceoverUrl(null);
    try {
      const res = await fetch("/api/video/voiceover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
      const data = await res.json();
      if (data.ok && data.url) setVoiceoverUrl(data.url);
      else setVoiceError(data.error ?? "voiceover_failed");
    } catch {
      setVoiceError("request_failed");
    } finally {
      setVoiceLoading(false);
    }
  }

  async function assemble() {
    const clips = scenes
      .filter((s) => s.clipUrl)
      .map((s) => {
        // Trim the drift tail off AI clips when we know their length.
        const trimmed =
          s.source === "ai" && s.duration && s.duration > AI_TAIL_TRIM_S + 0.5
            ? s.duration - AI_TAIL_TRIM_S
            : undefined;
        return { url: s.clipUrl, length: trimmed };
      });
    if (clips.length === 0) return;
    setRendering(true);
    setRenderError(null);
    setFinalUrl(null);
    setRenderStatus("queued");
    try {
      const res = await fetch("/api/video/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clips, aspect, voiceoverUrl: voiceoverUrl ?? undefined }),
      });
      const data = await res.json();
      if (!data.ok) {
        setRenderError(data.error ?? "render_failed");
        setRendering(false);
        return;
      }
      pollRender(data.id);
    } catch {
      setRenderError("request_failed");
      setRendering(false);
    }
  }

  async function publishVideo() {
    if (!finalUrl) return;
    setPublishing(true);
    setPubError(null);
    setPubResults([]);
    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: brand,
          posts: vidPlatforms.map((p) => ({ platform: p, text: caption })),
          mediaUrls: [finalUrl],
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

  const readyCount = scenes.filter((s) => s.clipUrl).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
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
        <label className="ml-2 text-sm font-medium text-slate-700">Aspect</label>
        <select
          value={aspect}
          onChange={(e) => setAspect(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="9:16">9:16 (shorts)</option>
          <option value="1:1">1:1</option>
          <option value="16:9">16:9</option>
        </select>
        <div className="w-full">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What's this video about? (e.g. Why UK trades are switching to an AI receptionist)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
        </div>
        {/* Auto-storyboard — the length lever: brain writes an N-beat narration
            and turns each beat into a scene. */}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-700">✨ Auto-storyboard</span>
          <label className="text-xs text-slate-500">length</label>
          <select
            value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          >
            <option value={16}>~15s (4 scenes)</option>
            <option value={24}>~25s (6 scenes)</option>
            <option value={32}>~30s (8 scenes)</option>
            <option value={40}>~40s (10 scenes)</option>
          </select>
          <button
            onClick={buildStoryboard}
            disabled={sbLoading || !aiConfigured || !topic.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {sbLoading ? "Writing…" : "Build scenes + script"}
          </button>
          <span className="text-xs text-slate-400">
            Writes the narration and builds the scenes — then generate the clips below.
          </span>
          {sbError && (
            <p className="w-full text-xs text-red-600">
              {sbError === "no_context"
                ? "Add Business Context for this brand first."
                : `Couldn't build: ${sbError}`}
            </p>
          )}
        </div>
      </div>

      {/* Scenes */}
      {scenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          Build your video from scenes — mix your own clips with AI-generated ones.
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((s, idx) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">Scene {idx + 1}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.source === "ai" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {s.source === "ai" ? "AI clip" : "Your clip"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <button onClick={() => move(s.id, -1)} className="px-1 hover:text-slate-700">↑</button>
                  <button onClick={() => move(s.id, 1)} className="px-1 hover:text-slate-700">↓</button>
                  <button onClick={() => remove(s.id)} className="px-1 hover:text-red-600">✕</button>
                </div>
              </div>

              {s.source === "ai" ? (
                <div className="space-y-2">
                  <textarea
                    value={s.prompt}
                    onChange={(e) => update(s.id, { prompt: e.target.value })}
                    rows={2}
                    placeholder="Describe this clip (e.g. slow pan over a workshop, warm light)…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => generate(s)}
                      disabled={s.status === "generating" || !aiConfigured || !s.prompt}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {s.status === "generating" ? "Generating… (1–3 min)" : "Generate clip"}
                    </button>
                    {s.directed && s.status !== "generating" && (
                      <span className="text-xs font-medium text-violet-600">🎨 brand-directed</span>
                    )}
                  </div>
                  {!aiConfigured && (
                    <p className="text-xs text-amber-600">
                      Add <code>HIGGSFIELD_API_KEY</code> to generate AI clips.
                    </p>
                  )}
                  {s.status === "error" && <p className="text-xs text-red-600">Error: {s.error}</p>}
                </div>
              ) : (
                <input
                  value={s.clipUrl}
                  onChange={(e) => update(s.id, { clipUrl: e.target.value, status: "ready" })}
                  placeholder="https://…link to your own clip"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              )}

              {s.clipUrl && (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={s.clipUrl}
                    controls
                    onLoadedMetadata={(e) =>
                      update(s.id, { duration: e.currentTarget.duration })
                    }
                    className="mt-3 w-full max-w-xs rounded-lg border border-slate-200"
                  />
                  {s.source === "ai" && s.duration && s.duration > AI_TAIL_TRIM_S + 0.5 && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      On assembly, the last {AI_TAIL_TRIM_S}s is trimmed to cut AI end-drift.
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add scene */}
      <div className="flex gap-2">
        <button
          onClick={() => addScene("ai")}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + AI clip
        </button>
        <button
          onClick={() => addScene("user")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          + Your clip
        </button>
      </div>

      {/* Voiceover */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">🎙️ Voiceover</h4>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs capitalize"
          >
            {TTS_VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={script}
          onChange={(e) => {
            setScript(e.target.value);
            setVoiceoverUrl(null);
          }}
          rows={3}
          placeholder="The spoken narration. Auto-storyboard fills this in — or write your own."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={generateVoiceover}
            disabled={voiceLoading || !aiConfigured || !script.trim()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {voiceLoading ? "Generating…" : voiceoverUrl ? "Regenerate voiceover" : "Generate voiceover"}
          </button>
          {voiceoverUrl && <span className="text-xs font-medium text-emerald-600">ready ✓</span>}
        </div>
        {voiceError && <p className="text-xs text-red-600">Error: {voiceError}</p>}
        {voiceoverUrl && (
          <audio src={voiceoverUrl} controls className="w-full max-w-xs">
            <track kind="captions" />
          </audio>
        )}
        <p className="text-[11px] text-slate-400">
          The voiceover is mixed under the video on assembly. Aim for roughly one
          scene per spoken sentence so the video is long enough to carry it.
        </p>
      </div>

      {/* Assemble */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">Assemble video</h4>
          <span className="text-xs text-slate-400">
            {readyCount} clip{readyCount === 1 ? "" : "s"} ready
            {voiceoverUrl ? " · voiceover on" : ""}
          </span>
        </div>
        <button
          onClick={assemble}
          disabled={rendering || !renderConfigured || readyCount === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {rendering ? `Rendering… (${renderStatus ?? "queued"})` : "Assemble into one video"}
        </button>
        {!renderConfigured && (
          <p className="text-xs text-amber-600">
            Add <code>SHOTSTACK_API_KEY</code> to stitch clips into a finished MP4.
          </p>
        )}
        {renderError && <p className="text-xs text-red-600">Error: {renderError}</p>}

        {finalUrl && (
          <div className="space-y-3 pt-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={finalUrl} controls className="w-full max-w-sm rounded-lg border border-slate-200" />
            <a
              href={finalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-medium text-slate-500 underline hover:text-slate-900"
            >
              Download / open video
            </a>

            {/* Publish the finished video */}
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <h5 className="text-sm font-semibold text-slate-700">Publish this video</h5>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                placeholder="Caption…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              <div className="flex flex-wrap gap-2">
                {VIDEO_PLATFORMS.map((p) => {
                  const on = vidPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() =>
                        setVidPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                        )
                      }
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                        on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={publishVideo}
                disabled={publishing || !publishConfigured || vidPlatforms.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish to GoHighLevel"}
              </button>
              {!publishConfigured && (
                <p className="text-xs text-amber-600">
                  Connect GoHighLevel for this brand (token + location) to publish.
                </p>
              )}
              {pubError && <p className="text-xs text-red-600">Error: {pubError}</p>}
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
          </div>
        )}
      </div>
    </div>
  );
}
