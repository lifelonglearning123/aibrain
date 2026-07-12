import { ingestRecaps } from "@/lib/loom-recaps";

export const maxDuration = 300;

/**
 * Weekly Loom-recap sync — called by Vercel Cron (see vercel.json).
 * Secured by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  }

  const result = await ingestRecaps({ limit: 12 });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
