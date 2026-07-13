import { runAllBrands } from "@/lib/ai/learn-run";
import { buildAndStoreBrief } from "@/lib/ai/brief";
import { embedMissingInsights } from "@/lib/embeddings";

export const maxDuration = 300;

/**
 * Scheduled learning — called by Vercel Cron (see vercel.json).
 * Secured by CRON_SECRET: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
 * when that env var is set. In local/dev with no secret, it runs unguarded.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const result = await runAllBrands();
  // After learning, refresh the morning brief so it's ready with the new insights.
  let briefOk = false;
  try {
    briefOk = Boolean(await buildAndStoreBrief());
  } catch {
    /* brief failure shouldn't fail the cron */
  }
  // Keep semantic search current: embed any new insights lacking an embedding.
  let embedded = 0;
  try {
    embedded = await embedMissingInsights(300);
  } catch {
    /* non-fatal */
  }
  return Response.json({ ...result, briefGenerated: briefOk, embedded }, { status: result.ok ? 200 : 500 });
}
