---
name: audit
description: >-
  Score the AI Brain against the 4 C's (Context, Connections, Capabilities, Cadence) and rank
  the biggest gaps by leverage. Trigger on "/audit", "audit the brain", "how complete is my AIOS".
---

# 4 C's Audit

## Goal
Tell Chao where the brain stands and exactly what to build next, ranked by leverage — so there's
never a "what do I do now?" moment.

## Steps
1. Scan the project: `context/`, `connections/connections.md`, `.claude/skills/`, and whether any
   cadence/routines exist.
2. Score each C out of 25 (total /100):
   - **Context** — how completely the business/you/priorities are captured (in Chao's own words?).
   - **Connections** — how many of the 7 buckets are actually reachable and tested.
   - **Capabilities** — number and quality of working, reused skills.
   - **Cadence** — scheduled routines doing useful work unattended.
3. List the **top 3 gaps ranked by leverage**, each with a concrete next action.
4. Offer to save the audit under `decisions/` with the date so progress is trackable over time.

## Rules
- Be honest and specific; a low early score is fine and expected on day one.
- Every gap must come with a *next action*, not just a complaint.
- Tie recommendations to Chao's current priorities where possible.
