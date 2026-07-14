import { createAdminClient } from "@/lib/supabase/admin";
import { embed } from "@/lib/ai/openai";

/**
 * Embed any insights that don't have an embedding yet, so semantic search
 * (Ask-your-data) stays current. Called from the nightly cron. Bounded per run.
 */
export async function embedMissingInsights(max = 300): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data } = await admin
    .from("brand_knowledge")
    .select("id,text")
    .is("embedding", null)
    .neq("kind", "correction") // taught facts are always-injected rules, not search entries
    .limit(max);
  if (!data || data.length === 0) return 0;

  let done = 0;
  for (let i = 0; i < data.length; i += 20) {
    const chunk = data.slice(i, i + 20);
    const embs = await Promise.all(chunk.map((r) => embed(String(r.text))));
    await Promise.all(
      chunk.map((r, j) => {
        const e = embs[j];
        if (!e) return Promise.resolve(null);
        return admin
          .from("brand_knowledge")
          .update({ embedding: "[" + e.join(",") + "]" })
          .eq("id", r.id);
      }),
    );
    done += embs.filter(Boolean).length;
  }
  return done;
}
