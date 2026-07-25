/**
 * GHL API v2 client — MULTI-TENANT.
 *
 * Ported from the single-tenant `facebook retargeting` project. The one
 * structural change: instead of reading one PIT + locationId from env, every
 * call takes a `LocationCtx` resolved per request from the `locations` table
 * (token decrypted from Vault). This is the token-provider abstraction the
 * blueprint calls for — today it carries a private token, tomorrow an OAuth
 * access token, and nothing else in this file changes.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export interface LocationCtx {
  /** Bearer token for this location (private integration token or OAuth access token). */
  token: string;
  /** GHL sub-account id. */
  locationId: string;
}

interface ReqOpts extends RequestInit {
  query?: Record<string, string | number | boolean | undefined>;
}

async function req<T>(ctx: LocationCtx, path: string, opts: ReqOpts = {}): Promise<T> {
  const { query, ...rest } = opts;
  let url = `${GHL_BASE}${path}`;
  if (query) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) usp.set(k, String(v));
    url += `?${usp.toString()}`;
  }
  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL ${path} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

// ─── Contacts ─────────────────────────────────────────────────────────────
export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  timezone?: string;
  tags?: string[];
  dnd?: boolean;
  dateAdded?: string;
  searchAfter?: unknown[];
  customFields?: Array<{ id?: string; key?: string; value?: string | number | boolean }>;
}

export async function getContact(ctx: LocationCtx, contactId: string): Promise<GhlContact | null> {
  try {
    const data = await req<{ contact: GhlContact }>(ctx, `/contacts/${contactId}`);
    return data.contact ?? null;
  } catch {
    return null;
  }
}

export async function updateContactCustomFields(
  ctx: LocationCtx,
  contactId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const customFields = Object.entries(fields).map(([key, value]) => ({ key, field_value: value }));
  await req(ctx, `/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ customFields }),
  });
}

export async function addTag(ctx: LocationCtx, contactId: string, tag: string): Promise<void> {
  await req(ctx, `/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags: [tag] }),
  });
}

export async function removeTag(ctx: LocationCtx, contactId: string, tag: string): Promise<void> {
  await req(ctx, `/contacts/${contactId}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags: [tag] }),
  });
}

export async function addNote(ctx: LocationCtx, contactId: string, body: string): Promise<void> {
  await req(ctx, `/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** Mark a contact do-not-disturb — used by the belt-and-braces STOP handler. */
export async function setDnd(ctx: LocationCtx, contactId: string, dnd = true): Promise<void> {
  await req(ctx, `/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ dnd }),
  });
}

/**
 * Upsert a contact by email/phone (GHL-native, per the standing preference).
 * Used to email an arbitrary address through GHL — e.g. auth links and agency
 * notifications from the platform location.
 */
export async function upsertContact(
  ctx: LocationCtx,
  input: { email?: string; phone?: string; name?: string; firstName?: string; customFields?: Record<string, string> }
): Promise<string> {
  const body: Record<string, unknown> = { locationId: ctx.locationId };
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;
  if (input.name) body.name = input.name;
  if (input.firstName) body.firstName = input.firstName;
  if (input.customFields && Object.keys(input.customFields).length) {
    // GHL wants the custom field's id (the fieldKey `contact.x` form is rejected).
    body.customFields = Object.entries(input.customFields).map(([id, field_value]) => ({ id, field_value }));
  }
  const data = await req<{ contact: { id: string } }>(ctx, "/contacts/upsert", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.contact.id;
}

// ─── Conversations (SMS / Email) ──────────────────────────────────────────
export async function sendSmsViaGhl(
  ctx: LocationCtx,
  opts: { contactId: string; message: string }
): Promise<{ messageId: string }> {
  const data = await req<{ messageId: string; conversationId?: string }>(ctx, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({ type: "SMS", contactId: opts.contactId, message: opts.message }),
  });
  return { messageId: data.messageId };
}

export async function sendEmailViaGhl(
  ctx: LocationCtx,
  opts: { contactId: string; subject: string; html: string; emailFrom?: string }
): Promise<{ messageId: string }> {
  const body: Record<string, unknown> = {
    type: "Email",
    contactId: opts.contactId,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.emailFrom) body.emailFrom = opts.emailFrom;
  const data = await req<{ messageId: string }>(ctx, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { messageId: data.messageId };
}

/** Send a WhatsApp message via GHL Conversations (requires the location's WhatsApp channel). */
export async function sendWhatsAppViaGhl(
  ctx: LocationCtx,
  opts: { contactId: string; message: string }
): Promise<{ messageId: string }> {
  const data = await req<{ messageId: string }>(ctx, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({ type: "WhatsApp", contactId: opts.contactId, message: opts.message }),
  });
  return { messageId: data.messageId };
}

// ─── MMS attachment (Phase 2) ──────────────────────────────────────────────
export async function sendMmsViaGhl(
  ctx: LocationCtx,
  opts: { contactId: string; message: string; attachments: string[] }
): Promise<{ messageId: string }> {
  const data = await req<{ messageId: string }>(ctx, "/conversations/messages", {
    method: "POST",
    body: JSON.stringify({
      type: "SMS",
      contactId: opts.contactId,
      message: opts.message,
      attachments: opts.attachments,
    }),
  });
  return { messageId: data.messageId };
}

// ─── Prior conversation history (planner context) ──────────────────────────
export async function getConversationHistory(
  ctx: LocationCtx,
  contactId: string,
  limit = 20
): Promise<Array<{ direction?: string; body?: string; type?: string; dateAdded?: string }>> {
  try {
    const search = await req<{ conversations: Array<{ id: string }> }>(ctx, "/conversations/search", {
      query: { locationId: ctx.locationId, contactId },
    });
    const convoId = search.conversations?.[0]?.id;
    if (!convoId) return [];
    const msgs = await req<{ messages: { messages: Array<{ direction?: string; body?: string; type?: string; dateAdded?: string }> } }>(
      ctx,
      `/conversations/${convoId}/messages`,
      { query: { limit } }
    );
    return msgs.messages?.messages ?? [];
  } catch {
    return [];
  }
}

// ─── Custom fields + tags (onboarding provisioner) ─────────────────────────
export interface GhlCustomField {
  id: string;
  name: string;
  fieldKey?: string;
  dataType: string;
  parentId?: string;
}

export async function listCustomFields(ctx: LocationCtx): Promise<GhlCustomField[]> {
  const data = await req<{ customFields: GhlCustomField[] }>(ctx, `/locations/${ctx.locationId}/customFields`);
  return data.customFields ?? [];
}

export async function createCustomField(
  ctx: LocationCtx,
  input: { name: string; dataType: "TEXT" | "NUMERICAL" | "DATE" | "CHECKBOX"; fieldKey?: string; model?: "contact"; group?: string }
): Promise<GhlCustomField> {
  const body: Record<string, unknown> = {
    locationId: ctx.locationId,
    name: input.name,
    dataType: input.dataType,
    model: input.model ?? "contact",
  };
  if (input.fieldKey) body.fieldKey = input.fieldKey;
  if (input.group) body.placeholder = input.group;
  if (input.dataType === "CHECKBOX") body.options = ["Yes"];
  const data = await req<{ customField: GhlCustomField }>(ctx, `/locations/${ctx.locationId}/customFields`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.customField;
}

export interface GhlTag { id?: string; name: string; }

export async function listTags(ctx: LocationCtx): Promise<GhlTag[]> {
  const data = await req<{ tags: GhlTag[] }>(ctx, `/locations/${ctx.locationId}/tags`);
  return data.tags ?? [];
}

export async function createTag(ctx: LocationCtx, name: string): Promise<GhlTag> {
  const data = await req<{ tag: GhlTag }>(ctx, `/locations/${ctx.locationId}/tags`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.tag;
}

// ─── Pipelines & opportunities (stop-stage guard) ──────────────────────────
export interface GhlPipelineStage { id: string; name: string; position?: number; }
export interface GhlPipeline { id: string; name: string; stages: GhlPipelineStage[]; }

export async function listPipelines(ctx: LocationCtx): Promise<GhlPipeline[]> {
  const data = await req<{ pipelines: GhlPipeline[] }>(ctx, "/opportunities/pipelines", {
    query: { locationId: ctx.locationId },
  });
  return (data.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: (p.stages ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));
}

// ─── Calendars (Phase 2 booking) ───────────────────────────────────────────
export async function getFreeSlots(
  ctx: LocationCtx,
  calendarId: string,
  opts: { startDate: number; endDate: number; timezone?: string }
): Promise<string[]> {
  const data = await req<{ [date: string]: { slots: string[] } }>(ctx, `/calendars/${calendarId}/free-slots`, {
    query: { startDate: opts.startDate, endDate: opts.endDate, timezone: opts.timezone },
  });
  const slots: string[] = [];
  for (const v of Object.values(data)) if (v && Array.isArray(v.slots)) slots.push(...v.slots);
  return slots;
}

// ─── Contact search by tag (bulk enrolment) ─────────────────────────────────

/** How many contacts carry a tag (cheap — reads the search `total`). */
export async function countContactsByTag(ctx: LocationCtx, tag: string): Promise<number> {
  const data = await req<{ total?: number }>(ctx, "/contacts/search", {
    method: "POST",
    body: JSON.stringify({ locationId: ctx.locationId, pageLimit: 1, filters: [{ field: "tags", operator: "contains", value: tag }] }),
  });
  return data.total ?? 0;
}

/** Page through contacts carrying a tag (up to `limit`), via the searchAfter cursor. */
export async function searchContactsByTag(ctx: LocationCtx, tag: string, opts?: { limit?: number }): Promise<GhlContact[]> {
  const hardLimit = opts?.limit ?? 500;
  const out: GhlContact[] = [];
  let searchAfter: unknown[] | undefined;
  while (out.length < hardLimit) {
    const body: Record<string, unknown> = {
      locationId: ctx.locationId,
      pageLimit: 100,
      filters: [{ field: "tags", operator: "contains", value: tag }],
    };
    if (searchAfter) body.searchAfter = searchAfter;
    const data = await req<{ contacts: GhlContact[] }>(ctx, "/contacts/search", { method: "POST", body: JSON.stringify(body) });
    const contacts = data.contacts ?? [];
    out.push(...contacts);
    if (contacts.length < 100) break;
    searchAfter = contacts[contacts.length - 1]?.searchAfter;
    if (!searchAfter) break;
  }
  return out.slice(0, hardLimit);
}
