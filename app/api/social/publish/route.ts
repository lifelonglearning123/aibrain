import { NextResponse } from "next/server";
import {
  createSocialPost,
  listSocialAccounts,
  resolveGhlAccountIds,
} from "@/lib/integrations/ghl-social";
import { ghlConfigForEntity } from "@/lib/integrations/ghl";
import { resolveEntity, ALL, type EntityKey } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

interface DraftIn {
  platform: string;
  text: string;
}

/** Publishes drafted posts to a brand's GoHighLevel social accounts. */
export async function POST(req: Request) {
  const access = supabaseConfig().configured ? await getAccess() : null;
  if (access && !access.hasAccess) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    entity?: string;
    posts?: DraftIn[];
    mediaUrls?: string[];
    scheduledTime?: string;
  };
  const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls : undefined;

  const entity = resolveEntity(body.entity);
  if (entity === ALL) {
    return NextResponse.json({ ok: false, error: "select_a_brand" }, { status: 400 });
  }
  if (access && !access.brands.includes(entity as EntityKey)) {
    return NextResponse.json({ ok: false, error: "forbidden_brand" }, { status: 403 });
  }
  if (!(await ghlConfigForEntity(entity as EntityKey)).configured) {
    return NextResponse.json({ ok: false, error: "ghl_not_configured" }, { status: 400 });
  }

  const posts = Array.isArray(body.posts) ? body.posts : [];
  if (posts.length === 0) {
    return NextResponse.json({ ok: false, error: "no_posts" }, { status: 400 });
  }

  const accounts = await listSocialAccounts(entity as EntityKey);

  const results = await Promise.all(
    posts.map(async (p) => {
      const accountIds = resolveGhlAccountIds(p.platform, accounts);
      if (accountIds.length === 0) {
        return { platform: p.platform, ok: false, status: 0, error: "no_connected_account" };
      }
      const r = await createSocialPost({
        entity: entity as EntityKey,
        accountIds,
        text: p.text,
        mediaUrls,
        scheduleDate: body.scheduledTime,
      });
      return { platform: p.platform, ...r };
    }),
  );

  return NextResponse.json({ ok: results.some((r) => r.ok), results });
}
