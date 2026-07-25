import { addNote, getContact, getConversationHistory, sendEmailViaGhl, sendSmsViaGhl, sendWhatsAppViaGhl } from "@/lib/goal-engine/engine/ghl/client";
import { createVoicemailCall } from "@/lib/goal-engine/engine/voice/retell";
import { loadLocation, resolveLocationCtx } from "@/lib/goal-engine/engine/ghl/context";
import { clampToQuietHours, isWithinQuietHours } from "@/lib/goal-engine/engine/cadence/quiet-hours";
import { resolveLeadTimezone } from "@/lib/goal-engine/engine/timezone";
import type { FlowStep } from "@/lib/goal-engine/engine/flow/schema";
import { personalizeStep } from "@/lib/goal-engine/engine/flow/draft";
import { loadGoalTargetLink } from "@/lib/goal-engine/engine/flow/store";
import {
  campaignStatus, hasOpened, hasReplied, loadCampaign, meter, recordStepExecution, setCurrentStep,
} from "@/lib/goal-engine/engine/executor/state";

/**
 * Engine-agnostic executor for a single FLOW step. Indexed by array position.
 * sms/email/whatsapp send via GHL (AI-personalized per lead unless verbatim);
 * voice is logged as pending (Retell wiring is Phase 3).
 *
 * SHADOW MODE (Phase 4 merge): pass `{ dryRun: true }` and the executor makes
 * every real decision — status, if-conditions, quiet-hours, message
 * composition (incl. AI personalization) — but performs NO outward send and
 * NO Goal Engine write (no recordStepExecution / setCurrentStep / meter /
 * addNote). It reports what it WOULD do via `onPreview` and returns the same
 * directive it would return live, so a shadow tick can run safely alongside
 * the live Goal Engine without touching a single row. `dryRun` defaults to
 * false — live behavior is unchanged.
 */
export type StepDirective =
  | { action: "advance"; nextStep: number }
  | { action: "halt"; reason: string }
  | { action: "skip"; nextStep: number; reason: string };

export type PreviewDecision = "would_send" | "would_skip" | "would_advance" | "would_defer" | "would_halt";

export interface StepPreview {
  campaignId: string;
  stepIndex: number;
  channel: string;
  decision: PreviewDecision;
  reason?: string;
  contact?: string;
  subject?: string;
  message?: string;
}

export interface ExecuteOpts {
  /** Simulate only: compute the decision + composed message, send nothing, write nothing. */
  dryRun?: boolean;
  /** Receives what the executor would do (only meaningful with dryRun). */
  onPreview?: (p: StepPreview) => void;
}

function renderVars(body: string, vars: Record<string, string | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export async function executeStep(
  campaignId: string,
  step: FlowStep,
  stepIndex: number,
  opts: ExecuteOpts = {},
): Promise<StepDirective> {
  const { dryRun = false, onPreview } = opts;
  const preview = (p: Omit<StepPreview, "campaignId" | "stepIndex">) =>
    onPreview?.({ campaignId, stepIndex, ...p });

  const campaign = await loadCampaign(campaignId);
  if (!campaign) {
    if (dryRun) preview({ channel: step.channel, decision: "would_halt", reason: "campaign_not_found" });
    return { action: "halt", reason: "campaign_not_found" };
  }

  const status = await campaignStatus(campaignId);
  if (status !== "running") {
    if (dryRun) preview({ channel: step.channel, decision: "would_halt", reason: `status_${status}` });
    return { action: "halt", reason: `status_${status}` };
  }

  const nextStep = stepIndex + 1;

  if (step.if === "no_reply" && (await hasReplied(campaignId))) {
    if (dryRun) preview({ channel: step.channel, decision: "would_skip", reason: "already_replied" });
    return { action: "skip", nextStep, reason: "already_replied" };
  }

  if (step.if === "opened" && !(await hasOpened(campaignId))) {
    if (dryRun) preview({ channel: step.channel, decision: "would_skip", reason: "not_opened" });
    return { action: "skip", nextStep, reason: "not_opened" };
  }

  const ctx = await resolveLocationCtx(campaign.location_id);
  const loc = await loadLocation(campaign.location_id);
  const contact = await getContact(ctx, campaign.ghl_contact_id);
  if (!contact) {
    if (dryRun) preview({ channel: step.channel, decision: "would_halt", reason: "contact_not_found" });
    return { action: "halt", reason: "contact_not_found" };
  }

  const contactLabel = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    || contact.phone || contact.email || campaign.ghl_contact_id;

  // The goal's CTA link fills {{calendar_link}}-style tokens the flow content uses.
  const targetLink = (await loadGoalTargetLink(campaign.goal_id)) ?? "";
  const vars: Record<string, string> = {
    first_name: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    full_name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    calendar_link: targetLink,
    booking_link: targetLink,
    cta_link: targetLink,
    link: targetLink,
    url: targetLink,
  };

  // Quiet-hours guard in the lead's timezone.
  const tz = resolveLeadTimezone({ ghlTimezone: contact.timezone, phoneE164: contact.phone, agencyTimezone: loc?.timezone });
  const win = { startHour: loc?.quiet_start ?? 9, endHour: loc?.quiet_end ?? 20, timezone: tz };
  if (!isWithinQuietHours(new Date(), win)) {
    const fireAt = clampToQuietHours(new Date(), win);
    if (dryRun) preview({ channel: step.channel, decision: "would_defer", contact: contactLabel, reason: `quiet_hours → ${fireAt.toISOString()}` });
    return { action: "skip", nextStep: stepIndex, reason: `deferred_to_${fireAt.toISOString()}` };
  }

  // Voice is planned but not yet sendable (Phase 3 / Retell).
  if (step.channel === "voice") {
    if (dryRun) {
      preview({ channel: "voice", decision: "would_advance", contact: contactLabel, reason: "voice_pending_phase3" });
      return { action: "advance", nextStep };
    }
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
      if (dryRun) {
        preview({ channel: "voicemail", decision: "would_advance", contact: contactLabel, reason: "no_voicemail_config" });
        return { action: "advance", nextStep };
      }
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
      const reason = hasConsent ? "no_phone" : "no_voice_consent";
      if (dryRun) {
        preview({ channel: "voicemail", decision: "would_skip", contact: contactLabel, reason });
        return { action: "skip", nextStep, reason };
      }
      await recordStepExecution({
        tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "voicemail",
        outcome: hasConsent ? "skipped_no_phone" : "skipped_no_voice_consent",
      });
      return { action: "skip", nextStep, reason };
    }
    const voicemailMessage = renderVars(step.content, vars);
    if (dryRun) {
      preview({ channel: "voicemail", decision: "would_send", contact: contactLabel, message: voicemailMessage });
      return { action: "advance", nextStep };
    }
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
  // (Personalization is an internal LLM call — safe to run in shadow; it produces
  // the exact preview the live send would use.)
  let subject = step.subject ? renderVars(step.subject, vars) : undefined;
  let message = renderVars(step.content, vars);
  if (step.personalize === "ai") {
    try {
      const history = await getConversationHistory(ctx, campaign.ghl_contact_id).catch(() => []);
      const drafted = await personalizeStep({
        // Give the drafter the brief with merge vars already resolved (real URL,
        // not {{calendar_link}}) so its "preserve links exactly" rule keeps it.
        step: { ...step, content: message, subject },
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

  if (step.channel === "sms" || step.channel === "whatsapp") {
    if (dryRun) {
      preview({ channel: step.channel, decision: "would_send", contact: contactLabel, message });
      return { action: "advance", nextStep };
    }
    try {
      const send = step.channel === "whatsapp" ? sendWhatsAppViaGhl : sendSmsViaGhl;
      const { messageId } = await send(ctx, { contactId: campaign.ghl_contact_id, message });
      await afterSend(campaign, stepIndex, step.channel, messageId, message);
      return { action: "advance", nextStep };
    } catch (err) {
      await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: step.channel, outcome: `error:${(err as Error).message}` });
      return { action: "halt", reason: "send_error" };
    }
  }

  // email
  if (!contact.email) {
    if (dryRun) {
      preview({ channel: "email", decision: "would_skip", contact: contactLabel, reason: "no_email" });
      return { action: "skip", nextStep, reason: "no_email" };
    }
    await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "email", outcome: "skipped_no_email" });
    return { action: "skip", nextStep, reason: "no_email" };
  }
  if (dryRun) {
    preview({ channel: "email", decision: "would_send", contact: contactLabel, subject, message });
    return { action: "advance", nextStep };
  }
  try {
    const { messageId } = await sendEmailViaGhl(ctx, { contactId: campaign.ghl_contact_id, subject: subject ?? "", html: message });
    await afterSend(campaign, stepIndex, "email", messageId, subject ? `${subject}\n${message}` : message);
    return { action: "advance", nextStep };
  } catch (err) {
    await recordStepExecution({ tenantId: campaign.tenant_id, campaignId, stepIndex, channel: "email", outcome: `error:${(err as Error).message}` });
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
