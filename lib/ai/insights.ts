import { chatJSON } from "./openai";

/**
 * Insight extraction — turns anonymised call summaries + user notes into reusable
 * marketing insights, flagging which correlate with a booking ("converts").
 */

export interface Insight {
  kind: string; // pain_point | objection | faq | winning_phrase | topic
  text: string;
  converts: boolean;
}

const KINDS = ["pain_point", "objection", "faq", "winning_phrase", "topic"];

export async function extractInsights(params: {
  brandName?: string;
  calls: { summary: string; booked: boolean; topic?: string | null }[];
  notes: string[];
}): Promise<Insight[]> {
  const { brandName, calls, notes } = params;
  if (calls.length === 0 && notes.length === 0) return [];

  const booked = calls.filter((c) => c.booked).length;
  const callsBlock =
    calls
      .slice(0, 150)
      .map(
        (c) =>
          `- [${c.booked ? "BOOKED" : "no-booking"}]${c.topic ? ` (${c.topic})` : ""} ${c.summary}`,
      )
      .join("\n") || "(none)";
  const notesBlock = notes.length ? notes.map((n) => `- ${n}`).join("\n") : "(none)";

  const system =
    "You analyse ANONYMISED sales/support call summaries and user notes to extract reusable " +
    "marketing insights. NEVER output personal data (names, phone numbers, emails, companies) — " +
    "describe patterns only. Extract recurring pain points, objections, frequently-asked questions, " +
    "and winning phrases/angles. Set converts=true when an insight is associated with calls that " +
    'BOOKED. Return ONLY JSON: {"insights":[{"kind":"pain_point|objection|faq|winning_phrase|topic",' +
    '"text":"...","converts":true|false}]} — 5 to 15 high-signal, de-duplicated items.';

  const user =
    `BRAND: ${brandName ?? "portfolio (all brands)"}\n` +
    `Calls analysed: ${calls.length} (${booked} booked)\n\n` +
    `CALL SUMMARIES:\n${callsBlock}\n\nUSER NOTES:\n${notesBlock}\n\nReturn the insights as JSON.`;

  const json = (await chatJSON(system, user)) as { insights?: unknown } | null;
  const arr = json?.insights;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = x as { kind?: unknown; text?: unknown; converts?: unknown };
      const kind = String(o.kind ?? "topic");
      return {
        kind: KINDS.includes(kind) ? kind : "topic",
        text: String(o.text ?? "").trim(),
        converts: Boolean(o.converts),
      };
    })
    .filter((x) => x.text);
}
