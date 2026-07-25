import { addNote, getContact, getConversationHistory, sendEmailViaGhl, sendSmsViaGhl, sendWhatsAppViaGhl } from "@/lib/goal-engine/engine/ghl/client";
import { createVoicemailCall } from "@/lib/goal-engine/engine/voice/retell";
import { loadLocation, resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { clampToQuietHours, isWithinQuietHours } from "@/lib/goal-engine/engine/cadence/quiet-hours";
import { resolveLeadTimezone } from "@/lib/goal-engine/engine/timezone";
import type { FlowStep } from "@/lib/goal-engine/engine/flow/schema";
import { personalizeStep } from "@/lib/goal-engine/engine/flow/draft";
import {
  campaignStatus, hasOpened, hasReplied, loadCampaign, meter, recordStepExecution, setCurrentStep,
} from "@/lib/goal-engine/engine/executor/state";

/**
 * Engine-agnostic executor for a single FLOW step. Indexed by array position.
 * sms/email/whatsapp send via GHL (AI-personalized per lead unless verbatim);
 * voice is logged as pending (Retell wiring is Phase 3).
 */
export type StepDirective =
  | { action: "advance"; nextStep: number }
  | { action: "halt"; reason: string }
  | { action: "skip"; nextStep: number; reason: string };

function renderVars(body: string, vars: Record<string, string | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export async function executeStep(campaignId: string, step: FlowStep, stepIndex: number): Promise<StepDirective> {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return { action: "halt", reason: "campaign_not_found" };

  const status = await campaignStatus(campaignId);
  if (status !== "running") return { action: "halt", reason: `status_${status}` };

  const nextStep = stepIndex + 1;

  if (step.if === "no_reply" && (await hasReplied(campaignId))) {
    return { action: "skip", nextStep, reason: "already_replied" };
  }

  if (step.if === "opened" && !(await hasOpened(campaignId))) {
    return { action: "skip", nextStep, reason: "not_opened" };
  }

  const ctx = await resolveLocationCtx(campaign.location_id);
  const loc = await loadLocation(campaign.location_id);
  const contact = await getContact(ctx, campaign.ghl_contact_id);
  if (!contact) return { action: "halt", reason: "contact_not_found" };

  const vars = {
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    full_name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
  };

  // Quiet-hours guard in the lead's timezone.
  const tz = resolveLeadTimezone({ ghlTimezone: contact.timezone, phoneE164: contact.phone, agencyTimezone: loc?.timezone });
  const win = { startHour: loc?.quiet_start ?? 9, endHour: loc?.quiet_end ?? 20, timezone: tz };
  if (!isWithinQuietHours(new Date(), win)) {
    const fireAt = clampToQuietHours(new Date(), win);
    return { action: "skip", nextStep: stepIndex, reason: `deferred_to_${fireAt.toISOString()}` };
  }

  // Voice is planned but not yet sendable (Phase 3 / Retell).
  if (step.channel === "voice") {
    await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voice", outcome: "voice_pending_phase3" });
    await setCurrentStep(campaign.id, stepIndex + 1);
    return { action: "advance", nextStep };
  }

  // Voicemail drop (opt-in, consent-gated) via Retell — leverages the Signal
  // platform's Retell account. Non-blocking: place the drop and advance.
  if (step.channel === "voicemail") {
    const agentId = loc?.retell_voicemail_agent_id;
    const fromNumber = loc?.retell_from_number;
    if (!agentId || !fromNumber) {
      await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voicemail", outcome: "skipped_no_voicemail_config" });
      await setCurrentStep(campaign.id, stepIndex + 1);
      return { action: "advance", nextStep };
    }
    // TCPA: a drop to a wireless number is a call — require the location's voice
    // consent tag. (The quiet-hours guard above already keeps us inside 8–21 local.)
    const consentTag = (loc?.voice_consent_field ?? "").toLowerCase();
    const hasConsent =
      consentTag.length > 0 && (contact.tags ?? []).map((t) => t.toLowerCase()).includes(consentTag);
    if (!hasConsent || !contact.phone) {
      await recordStepExecution({
        tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voicemail",
        outcome: hasConsent ? "skipped_no_phone" : "skipped_no_voice_consent",
      });
      return { action: "skip", nextStep, reason: hasConsent ? "no_phone" : "no_voice_consent" };
    }
    const voicemailMessage = renderVars(step.content, vars);
    try {
      const { callId } = await createVoicemailCall({
        fromNumber,
        toNumber: contact.phone,
        agentId,
        dynamicVariables: { first_name: vars.first_name, voicemail_message: voicemailMessage, touch_mode: "voicemail" },
        metadata: {
          campaign_id: campaign.id, tenant_id: campaign.tenant_id, location_db_id: campaign.location_id,
          step_index: String(stepIndex), ghl_contact_id: campaign.ghl_contact_id, mode: "voicemail",
        },
      });
      await recordStepExecution({
        tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voicemail",
        payload: { voicemail_message: voicemailMessage, call_id: callId }, outcome: "voicemail_dropped",
      });
      await setCurrentStep(campaign.id, stepIndex + 1);
      await meter({ tenantId: campaign.tenant_id, metric: "voicemail", quantity: 1, campaignId: campaign.id });
      return { action: "advance", nextStep };
    } catch (err) {
      await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voicemail", outcome: `error:${(err as Error).message}` });
      return { action: "halt", reason: "send_error" };
    }
  }

  // Compose message: AI-personalized from the brief, or verbatim with merge fields.
  let subject = step.subject ? renderVars(step.subject, vars) : undefined;
  let message = renderVars(step.content, vars);
  if (step.personalize === "ai") {
    try {
      const history = await getConversationHistory(ctx, campaign.ghl_contact_id).catch(() => []);
      const drafted = await personalizeStep({
        step,
        contact: { firstName: contact.firstName, lastName: contact.lastName, tags: contact.tags },
        history,
        businessProfile: loc?.business_profile,
      });
      message = drafted.message || message;
      if (step.channel === "email" && drafted.subject) subject = drafted.subject;
    } catch {
      /* fall back to the brief with merge fields */
    }
  }

  try {
    if (step.channel === "sms" || step.channel === "whatsapp") {
      const send = step.channel === "whatsapp" ? sendWhatsAppViaGhl : sendSmsViaGhl;
      const { messageId } = await send(ctx, { contactId: campaign.ghl_contact_id, message });
      await afterSend(campaign, stepIndex, step.channel, messageId, message);
      return { action: "advance", nextStep };
    }

    // email
    if (!contact.email) {
      await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "email", outcome: "skipped_no_email" });
      return { action: "skip", nextStep, reason: "no_email" };
    }
    const { messageId } = await sendEmailViaGhl(ctx, { contactId: campaign.ghl_contact_id, subject: subject ?? "", html: message });
    await afterSend(campaign, stepIndex, "email", messageId, subject ? `${subject}\n${message}` : message);
    return { action: "advance", nextStep };
  } catch (err) {
    await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: step.channel, outcome: `error:${(err as Error).message}` });
    return { action: "halt", reason: "send_error" };
  }
}

async function afterSend(
  campaign: { id: string; tenant_id: string; location_id: string; ghl_contact_id: string },
  stepIndex: number, channel: string, messageId: string, snapshot: string
): Promise<void> {
  await recordStepExecution({
    tenantId: campaign.tenant_id, campaignId: campaign.id, stepIndex,
    channel, payload: { snapshot }, ghlMessageId: messageId, outcome: "sent",
  });
  await setCurrentStep(campaign.id, stepIndex + 1);
  await meter({ tenantId: campaign.tenant_id, metric: channel, quantity: 1, campaignId: campaign.id });
  const ctx = await resolveLocationCtx(campaign.location_id);
  await addNote(ctx, campaign.ghl_contact_id, `AI ${channel.toUpperCase()} sent · step ${stepIndex}\n${snapshot}`).catch(() => {});
}
