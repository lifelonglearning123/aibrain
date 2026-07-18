import { listRecentPosts, type GhlPublishedPost } from "@/lib/integrations/ghl-social";
import type { EntityKey } from "@/lib/entities";

/**
 * Real post performance — the outcome side of the social loop. Reads published
 * posts + engagement live from GHL (the source of truth; no copy kept here) and
 * turns them into (a) a prompt block so suggestions/drafts do more of what
 * worked and avoid what flopped, and (b) data for the performance panel.
 * Scoring follows the brain's goal weighting: distribution (shares) > engagement
 * (comments) > vanity (likes).
 */

export interface ScoredPost extends GhlPublishedPost {
  engagement: number;
}

export interface PostPerformance {
  /** Published posts, newest first. */
  posts: ScoredPost[];
  /** Best real engagement — angles to do more of. */
  top: ScoredPost[];
  /** Zero engagement after 48h+ live — angles to avoid. */
  flops: ScoredPost[];
}

const EMPTY: PostPerformance = { posts: [], top: [], flops: [] };

function score(p: GhlPublishedPost): number {
  return p.shares * 3 + p.comments * 2 + p.likes;
}

export async function getPostPerformance(entity: EntityKey): Promise<PostPerformance> {
  const raw = await listRecentPosts(entity, 50);
  const posts: ScoredPost[] = raw
    .filter((p) => p.status === "published" && p.text.trim())
    .map((p) => ({ ...p, engagement: score(p) }))
    .sort(
      (a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
    );
  if (posts.length === 0) return EMPTY;

  // The same message is often published to several platforms — count it once
  // (top keeps its best-performing instance; sorted first = highest).
  const dedupe = (list: ScoredPost[]) => {
    const seen = new Set<string>();
    return list.filter((p) => {
      const key = p.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);
      return seen.has(key) ? false : (seen.add(key), true);
    });
  };

  const top = dedupe(
    [...posts].sort((a, b) => b.engagement - a.engagement).filter((p) => p.engagement > 0),
  ).slice(0, 5);
  // Only call a post a flop once it's had 48h to earn engagement — and only if
  // NO platform instance of that message earned anything.
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const topKeys = new Set(
    posts
      .filter((p) => p.engagement > 0)
      .map((p) => p.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120)),
  );
  const flops = dedupe(
    posts.filter(
      (p) =>
        p.engagement === 0 &&
        // Ignore throwaway/test posts — they're not evidence about angles.
        p.text.trim().length >= 40 &&
        p.publishedAt &&
        Date.parse(p.publishedAt) < cutoff &&
        !topKeys.has(p.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120)),
    ),
  ).slice(0, 5);
  return { posts, top, flops };
}

function clip(s: string, n = 180): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/** Format performance as a prompt block. Returns "" when there's no signal yet. */
export function performancePrompt(perf: PostPerformance): string {
  const parts: string[] = [];
  if (perf.top.length) {
    parts.push(
      `Top performers — do more angles/styles like these:\n${perf.top
        .map(
          (p) =>
            `- [${p.platform}] ${p.likes} likes · ${p.comments} comments · ${p.shares} shares: "${clip(p.text)}"`,
        )
        .join("\n")}`,
    );
  }
  if (perf.flops.length) {
    parts.push(
      `Got ZERO engagement (48h+ live) — avoid these angles/styles:\n${perf.flops
        .map((p) => `- [${p.platform}] "${clip(p.text)}"`)
        .join("\n")}`,
    );
  }
  if (!parts.length) return "";
  return `REAL POST PERFORMANCE (live from the connected social accounts):\n${parts.join("\n")}`;
}
