import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTITIES, type EntityKey } from "@/lib/entities";
import type { CardContent } from "@/lib/ai/image-director";

/**
 * Branded graphic cards — crisp text in brand colours, rendered as a layout
 * (satori via next/og) instead of asking a diffusion model to draw words.
 * The PNG is uploaded to Supabase storage (public bucket) so GHL can fetch it
 * as post media.
 */

const BUCKET = "social-images";

function dims(aspect?: string): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1200, height: 675 };
    case "9:16":
      return { width: 810, height: 1440 };
    case "4:5":
      return { width: 1080, height: 1350 };
    default:
      return { width: 1080, height: 1080 }; // 1:1
  }
}

export async function renderSocialCard(params: {
  entity: EntityKey;
  card: CardContent;
  aspect?: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { entity, card, aspect } = params;
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "store_unavailable" };

  const brand = ENTITIES.find((e) => e.key === entity);
  const accent = brand?.color ?? "#2563eb";
  const { width, height } = dims(aspect);
  const s = width / 1080; // scale typography with the canvas

  const hasStat = Boolean(card.statValue);
  // Long headlines get a smaller size so they never overflow the card.
  const headlineSize =
    (card.headline.length > 60 ? 52 : card.headline.length > 34 ? 62 : 76) *
    s *
    (hasStat ? 0.72 : 1);

  const img = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${64 * s}px ${72 * s}px`,
          backgroundColor: "#0b1220",
          backgroundImage: `linear-gradient(135deg, #0b1220 55%, ${accent} 220%)`,
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 14 * s,
              height: 14 * s,
              borderRadius: 999,
              backgroundColor: accent,
              marginRight: 14 * s,
            }}
          />
          <div
            style={{
              fontSize: 26 * s,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#cbd5e1",
            }}
          >
            {brand?.name ?? entity}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {hasStat && (
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 28 * s }}>
              <div style={{ fontSize: 170 * s, lineHeight: 1, color: accent }}>
                {card.statValue}
              </div>
              {card.statLabel && (
                <div
                  style={{
                    fontSize: 30 * s,
                    color: "#94a3b8",
                    marginLeft: 22 * s,
                    marginBottom: 18 * s,
                    maxWidth: width * 0.4,
                  }}
                >
                  {card.statLabel}
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: headlineSize, lineHeight: 1.12 }}>{card.headline}</div>
          {card.sub && (
            <div
              style={{
                fontSize: 32 * s,
                lineHeight: 1.35,
                color: "#94a3b8",
                marginTop: 26 * s,
              }}
            >
              {card.sub}
            </div>
          )}
        </div>

        <div
          style={{
            width: 130 * s,
            height: 8 * s,
            borderRadius: 999,
            backgroundColor: accent,
          }}
        />
      </div>
    ),
    { width, height },
  );

  try {
    const buf = Buffer.from(await img.arrayBuffer());
    // Ensure the public bucket exists (no-op if it already does).
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const path = `${entity}/${crypto.randomUUID()}.png`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (error) return { ok: false, error: error.message };
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "card_render_failed" };
  }
}
