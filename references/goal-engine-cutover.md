# Goal Engine merge — cutover runbook

The Brain now contains all of Goal Engine (data client, execution engine, native
UI). This is the runbook for the **cutover**: the moment the Brain stops merely
*shadowing* Goal Engine and starts *being* it.

## The single switch

Everything execution-related is gated by one env var in the Brain:

```
GOAL_ENGINE_EXECUTE = true      # off/absent = shadow, true = live
```

- **Shadow (default, where we are now):** `/api/goal-engine/tick` simulates the
  due queue — it composes exactly what it *would* send (real AI personalization)
  but **claims nothing, sends nothing, writes nothing**. `enroll-tick` and
  `reengage-tick` are no-ops. The live Goal Engine still owns execution. Zero risk
  of double-sends.
- **Live (after cutover):** the same routes run for real — claim steps, send
  SMS/email/WhatsApp, enrol contacts, recycle cold leads.

## Before cutover — prove parity (shadow)

1. Open **Goals & campaigns → Execution** in the Brain. It shows the current due
   queue and, per due step, what the Brain *would* send (channel, contact, the
   composed message). Sanity-check a few against what Goal Engine actually sent.
2. Optionally hit the tick in shadow directly:
   `GET /api/goal-engine/tick?mode=shadow` with `Authorization: Bearer <CRON_SECRET>`.
3. Confirm the daily shadow cron is logging `shadow: N due, M would send` in
   Vercel logs with no errors.

## Cutover — do these together, in order

> Requires the Brain on **Vercel Pro** (per-minute crons; Hobby caps at daily).

1. **Add the production crons to the Brain's `vercel.json`** (replace the daily
   shadow line):
   ```json
   { "path": "/api/goal-engine/tick",          "schedule": "* * * * *" },
   { "path": "/api/goal-engine/enroll-tick",   "schedule": "*/15 * * * *" },
   { "path": "/api/goal-engine/reengage-tick", "schedule": "0 15 * * *" }
   ```
2. **Turn OFF Goal Engine's own crons** — in the old `Lead generator` deploy,
   remove the three crons from its `vercel.json` (or pause/delete that Vercel
   project's cron schedules). This is what prevents double-sends.
3. **Repoint GHL inbound webhooks** from the old Goal Engine URL to the Brain.
   The webhook handler must exist in the Brain first (`/api/webhooks/ghl` —
   port from Goal Engine; not yet ported as of Phase 4). Until then, replies/opens
   still land at the old deploy.
4. **Flip the switch:** set `GOAL_ENGINE_EXECUTE=true` in the Brain's Vercel env
   and redeploy.
5. **Watch the first ticks** in Vercel logs (`LIVE: processed N`) and in the
   Execution page. Confirm sends land in GHL as expected.

## Rollback

Set `GOAL_ENGINE_EXECUTE` back to off (or `mode=shadow`) and re-enable Goal
Engine's crons. Because the Brain and Goal Engine share the **same** database,
whichever one is running picks up exactly where the other left off — no data
migration, no reconciliation.

## Still to port before full cutover (tracked)

- `/api/webhooks/ghl` — inbound reply/open/opt-out handling (drives `no_reply` /
  `opened` conditions and opt-outs). **Required for step 3.**
- `/api/enroll/[goalId]`, `/api/convert/[goalId]` — external enrol/convert hooks,
  if anything calls the old deploy's versions directly.
- Interactive create/edit of goals + flows in the Brain (currently read-only
  native views; authoring still happens in the Goal Engine admin).

## Secrets moved into the Brain (Phase 4)

Copied from Goal Engine's `.env.local` into the Brain's (git-ignored), values
unchanged: `APP_ENCRYPTION_KEY` (decrypts stored GHL tokens), `CRON_SECRET`,
`SUPABASE_VAULT_ENABLED`, `APP_URL`, the `LLM_*` config + `OPENROUTER_API_KEY`
(personalization), `ANTHROPIC_FALLBACK_MODEL`, `DURABLE_ENGINE`, and
`BRAIN_URL`/`BRAIN_SECRET`/`BRAIN_BRAND`. `GOAL_ENGINE_SUPABASE_URL`/`_SERVICE_KEY`
were already present (Phase 1). Retell/voicemail was never configured, so voice
stays pending.
```
