import { type LocationCtx, sendEmailViaGhl, upsertContact } from "@/lib/goal-engine/engine/ghl/client";

/**
 * Platform-level email — the app's OWN emails (auth links, agency
 * notifications) sent through a single platform GHL location, honoring the
 * "everything via GHL" preference (no Resend/SMTP). Requires the platform
 * location's Email channel to be configured in GHL (Mailgun/SMTP).
 */
export function platformCtx(): LocationCtx {
  const token = process.env.PLATFORM_GHL_TOKEN;
  const locationId = process.env.PLATFORM_GHL_LOCATION_ID;
  if (!token || !locationId) throw new Error("PLATFORM_GHL_LOCATION_ID / PLATFORM_GHL_TOKEN not set");
  return { token, locationId };
}

/** Upsert the recipient as a contact in the platform location, then email them via GHL. */
export async function sendEmailToAddress(input: {
  email: string;
  name?: string;
  subject: string;
  html: string;
}): Promise<void> {
  const ctx = platformCtx();
  const contactId = await upsertContact(ctx, { email: input.email, name: input.name });
  await sendEmailViaGhl(ctx, {
    contactId,
    subject: input.subject,
    html: input.html,
    emailFrom: process.env.PLATFORM_EMAIL_FROM,
  });
}
