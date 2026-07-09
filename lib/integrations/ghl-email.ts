import { ENTITIES, type EntityKey } from "@/lib/entities";
import { cred } from "@/lib/credentials";
import { ghlConfigForEntity, configuredGhlEntities } from "@/lib/integrations/ghl";

/**
 * Transactional email over GoHighLevel. GHL sends email to a CONTACT, so we
 * upsert the recipient as a contact in the sender brand's location, then post an
 * Email message on the Conversations API. One default "sender brand" is used for
 * all system emails (invites, sign-in links) — see resolveEmailSenderEntity().
 */

const API_BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function ghlFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Which brand's GHL sends system emails. Reads EMAIL_SENDER_BRAND (default
 * macaws); if that brand has no GHL connected, falls back to any connected brand.
 */
export async function resolveEmailSenderEntity(): Promise<EntityKey | null> {
  const raw = ((await cred("EMAIL_SENDER_BRAND")) ?? "macaws").trim();
  const preferred = ENTITIES.find((e) => e.key === raw)?.key;
  if (preferred && (await ghlConfigForEntity(preferred)).configured) return preferred;
  const configured = await configuredGhlEntities();
  return configured[0] ?? null;
}

export async function sendBrandEmail(params: {
  entity: EntityKey;
  to: string;
  toName?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = await ghlConfigForEntity(params.entity);
  if (!cfg.configured || !cfg.token || !cfg.locationId) {
    return { ok: false, error: "sender_not_configured" };
  }

  try {
    // 1) Upsert the recipient as a contact in the sender location.
    const upRes = await ghlFetch(cfg.token, `/contacts/upsert`, {
      method: "POST",
      body: JSON.stringify({
        locationId: cfg.locationId,
        email: params.to,
        name: params.toName,
      }),
    });
    const upData: any = await upRes.json().catch(() => ({}));
    const contactId =
      upData?.contact?.id ?? upData?.id ?? upData?.contact?._id ?? upData?.contactId;
    if (!upRes.ok || !contactId) {
      return { ok: false, error: upData?.message ?? `contact_upsert_failed_${upRes.status}` };
    }

    // 2) Send the email message on the conversation.
    const msgRes = await ghlFetch(cfg.token, `/conversations/messages`, {
      method: "POST",
      body: JSON.stringify({
        type: "Email",
        contactId,
        subject: params.subject,
        html: params.html,
      }),
    });
    const msgData: any = await msgRes.json().catch(() => ({}));
    if (!msgRes.ok) {
      return { ok: false, error: msgData?.message ?? `email_send_failed_${msgRes.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ghl_email_failed" };
  }
}

/** Send from the default sender brand. Returns which brand actually sent it. */
export async function sendSystemEmail(args: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string; via?: EntityKey }> {
  const entity = await resolveEmailSenderEntity();
  if (!entity) return { ok: false, error: "no_ghl_sender_configured" };
  const r = await sendBrandEmail({ entity, ...args });
  return { ...r, via: entity };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
