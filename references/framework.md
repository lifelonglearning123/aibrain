# Reference — The 3 M's and 4 C's

## 3 M's of AI

- **Mindset** — For every task ask "to what extent can AI do this?" (never binary; find the %).
  Treat AI as a *mentor, not a vending machine*. Your job is a *tree of tasks* — automate one
  branch at a time. Expect a short productivity dip before the climb; push through it.
- **Method** — Decide *what's worth automating* and *how much*. Prefer boring, deterministic
  workflows where they suffice — they beat autonomous agents 9 times out of 10 for business ops.
- **Machine** — How you wire it: context files, connections, skills, cadence.

## 4 C's of an AIOS (the build order)

1. **Context** — what it knows about you, the team, tools, voice, money.
   *Test:* ask it a question — does it answer like a teammate or a stranger?
2. **Connections** — what live data it can reach (CLI / API / MCP).
   *Test:* "what's on my plate today?" — can it actually look?
3. **Capabilities** — what it can *produce*: skills = your SOPs as repeatable recipes.
   *Test:* "build me the Q3 report" — does it just do it?
4. **Cadence** — it acts on a schedule while you sleep (routines / cron / loops).
   *Test:* does useful work land without you starting it?

Each builds on the last — you can't have cadence without connections, or capability without
context. Tools change every ~6 months; this durable layer moves across Claude Code, Codex, etc.

## The 7 data buckets

Revenue · Customer · Calendar · Comms · Tasks · Meetings · Knowledge.
Map every important data source into one of these, then connect them in priority order.

## Skills, briefly

A skill = a folder with a `SKILL.md` (name + description + step-by-step SOP), optionally with
reference files and scripts. It loads progressively (name/description first, full steps only
when triggered, extra files only when needed) so it stays cheap on tokens. Build them by doing
a task once with the brain, then saying "turn this into a skill." Keep `SKILL.md` under ~500
lines; push detail into reference files.

## Mindset shorthands

- **Default shift** — if it's boring/repetitive, don't do it manually; leverage the brain.
- **POC first** — prove a concept cheaply (e.g. a Claude artifact dashboard) before building
  a custom Vercel/Supabase version.
- **Failure is data** — when a skill/connection errors, update the doc so it never recurs.

## Success criteria (subjective, not KPIs)

1. Your team would rather ask the brain than ask you (it has better memory + the source).
2. You stop opening dozens of tabs — most work happens through the brain.
3. Knowledge leaves your head — reminders and files hold it, not you.
Two of three true within a month = it's working.
