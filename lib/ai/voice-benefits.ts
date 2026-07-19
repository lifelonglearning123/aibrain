/**
 * Verified AI-voice benefit facts for benefit-led drafting (retargeting, social).
 * Distilled from references/ai-voice-benefits.md — every figure here survived
 * 3-vote adversarial verification. The prompt block instructs the model to
 * ATTRIBUTE each stat and never use the refuted "facts" (see the MD file).
 * Keep this in sync with references/ai-voice-benefits.md.
 */
export const VOICE_BENEFITS = `VERIFIED FACTS ABOUT AI VOICE RECEPTIONISTS (use to TEACH; attribute each stat to its source; never present a vendor figure as settled fact):
- Speed-to-lead is decisive: a lead contacted within 5 minutes is ~8x more likely to convert than one contacted later (InsideSales, 5.7M leads); responding within 5 min vs 30 min makes a business ~100x more likely to reach the lead and ~21x more likely to qualify it (MIT Sloan / Lead Response Management study); calling within 1 minute lifted conversion +391% (Velocify). An AI receptionist answers and follows up in seconds — that IS the speed-to-lead mechanism.
- Most small firms miss a lot of calls: a 411 Locals study found only 37.8% of inbound SMB calls were answered live (~62% unanswered) and 70% of businesses answered under half their calls.
- The trend is real and early: the conversational AI market is ~$11.58B (2024) growing to ~$41.39B by 2030 at 23.7% CAGR (Grand View Research); the Intelligent Virtual Assistant segment is the fastest-growing type at 24.4% CAGR; SMEs are the fastest-growing adopters (~24.6% CAGR, Mordor Intelligence).

RULES: Teach the benefit first, use the stat as proof, attribute it (e.g. "according to MIT/InsideSales research"). NEVER cite: revenue-per-missed-call ($126k), "85% won't call back", "80% hang up on voicemail", after-hours %, ROI-vs-human or pricing figures, or UK-specific missed-call stats — those failed verification. Prefer the brand's OWN client results when available.`;
