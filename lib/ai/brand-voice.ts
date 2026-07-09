import { chatJSON } from "./openai";

export interface InterviewTurn {
  question: string;
  answer: string;
}

export interface InterviewResult {
  mode: "question" | "complete";
  question?: string;
  brandVoice?: string;
}

/**
 * One step of the brand-voice interview. Given the Q&A so far, the model either
 * asks the next question (one at a time, pushing back on vague answers) or, once
 * it has enough, synthesises the finished brand voice as Markdown.
 */
export async function interviewStep(params: {
  brandName: string;
  history: InterviewTurn[];
}): Promise<InterviewResult | null> {
  const { brandName, history } = params;

  const system =
    "You are building a social-media BRAND VOICE profile by interviewing the user. " +
    "Ask ONE focused question at a time. If an answer is vague or generic, push back and " +
    "ask them to be specific before moving on. Cover, over the interview: identity / what they " +
    "do, target audience, tone and voice rules, signature phrases, stories & proof they can " +
    "claim, offers & CTAs, and per-platform preferences. After about 6–8 solid answers, STOP " +
    "asking and synthesise a complete, well-structured brand voice in Markdown. " +
    'Return ONLY JSON: {"mode":"question","question":"..."} while interviewing, or ' +
    '{"mode":"complete","brandVoice":"# Brand Voice\\n..."} when done.';

  const convo = history.length
    ? history.map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`).join("\n\n")
    : "(no answers yet — ask your first question)";

  const user =
    `BRAND: ${brandName}\n\nInterview so far:\n${convo}\n\n` +
    "Return the next question, or the complete brand voice if you have enough.";

  const json = (await chatJSON(system, user)) as InterviewResult | null;
  if (!json || (json.mode !== "question" && json.mode !== "complete")) return null;
  return json;
}
