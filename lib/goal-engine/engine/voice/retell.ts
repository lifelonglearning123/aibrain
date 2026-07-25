/**
 * Minimal Retell OUTBOUND client for voicemail drops.
 *
 * The Signal voice platform (c:\python\Signal) already manages Retell agents,
 * phone numbers, and voices for the same account; it doesn't place outbound
 * calls, so this adds just that one endpoint, reusing the same base + bearer
 * auth. Configure RETELL_API_KEY to the same Retell account whose agents/numbers
 * Signal manages, then set each location's retell_voicemail_agent_id (an agent
 * whose voicemail message renders {{voicemail_message}}) and retell_from_number.
 */

const BASE = "https://api.retellai.com";

export interface CreateVoicemailCallInput {
  fromNumber: string; // E.164, owned in Retell
  toNumber: string; // E.164
  agentId: string; // Retell voicemail agent
  dynamicVariables: Record<string, string>;
  metadata: Record<string, string>;
}

export async function createVoicemailCall(
  input: CreateVoicemailCallInput,
): Promise<{ callId: string }> {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error("RETELL_API_KEY is not configured");

  const res = await fetch(`${BASE}/v2/create-phone-call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from_number: input.fromNumber,
      to_number: input.toNumber,
      override_agent_id: input.agentId,
      retell_llm_dynamic_variables: input.dynamicVariables,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Retell create-phone-call ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { call_id: string };
  return { callId: data.call_id };
}
