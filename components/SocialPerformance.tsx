import { getPostPerformance } from "@/lib/social-performance";
import { ENTITIES, type EntityKey } from "@/lib/entities";

/**
 * Recent post performance — live from GHL, so Chao can see what the brain sees.
 * The same numbers feed the suggestion engine ("do more of what worked").
 * Server component; renders nothing when there's no published-post data yet.
 */

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function clip(s: string, n = 110): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export async function SocialPerformance({ entity }: { entity: EntityKey }) {
  const perf = await getPostPerformance(entity);
  if (perf.posts.length === 0) return null;

  const name = ENTITIES.find((e) => e.key === entity)?.name ?? entity;
  const best = perf.top[0];
  const recent = perf.posts.slice(0, 6);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Recent post performance — {name}
        </h3>
        <span className="text-xs text-slate-400">
          live from GHL · feeds the suggestions
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {recent.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {p.platform}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-600" title={p.text}>
              {p.previewLink ? (
                <a
                  href={p.previewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {clip(p.text)}
                </a>
              ) : (
                clip(p.text)
              )}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">
              {p.likes}👍 {p.comments}💬 {p.shares}↗
            </span>
            <span className="w-14 shrink-0 text-right text-xs text-slate-400">
              {timeAgo(p.publishedAt)}
            </span>
            {best && p.id === best.id && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                top
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
