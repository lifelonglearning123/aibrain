---
name: plan-my-day
description: >-
  Plan Chao's day or week. Trigger on "plan my day/week", "what should I focus on",
  "what's on my plate". Reads priorities, calendar, tasks and open threads, then proposes a
  prioritised, time-blocked plan and flags what could slip.
---

# Plan My Day / Week

## Goal
Give Chao a clear, prioritised plan for the day or week in under a minute of reading — grounded
in real priorities and (once connected) live calendar/task/comms data.

## Steps
1. Read `context/priorities.md`, `context/about-business.md`, and the latest entries in
   `decisions/decision-log.md`.
2. If connections are wired, pull: today's calendar, open/overdue tasks, and anything flagged in
   comms in the last few days. If not wired yet, say so and plan from priorities alone.
3. Cluster the work into 3–5 focus blocks ranked by impact on current priorities.
4. Apply the **default shift**: for each block, note where AI could do 30–100% of it, and offer
   to run the relevant skill.
5. Output:
   - **Top 3 for today** (with the single most important first)
   - **Suggested time blocks**
   - **At risk / might slip** (with who to follow up)
   - **One question** that would make tomorrow's plan sharper.

## Rules
- Lead with the recommendation; keep it skimmable. No jargon.
- Never invent calendar/task data — if a connection is missing, state the gap and proceed.
- Don't send messages or change anything without explicit confirmation.
