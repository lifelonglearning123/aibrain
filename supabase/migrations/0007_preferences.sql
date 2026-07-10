-- Preference capture — learn from what you approve / edit / reject on AI drafts.
-- Run after 0001–0006. Safe to re-run.

create table if not exists content_feedback (
  id         uuid primary key default gen_random_uuid(),
  entity_key text,                         -- brand the draft was for
  kind       text not null default 'social',   -- social | sequence
  platform   text,                         -- instagram | linkedin | ... (social)
  original   text,                         -- the AI's draft
  final      text,                         -- what the user actually kept/published
  action     text not null check (action in ('approve','edit','reject')),
  reason     text,                         -- optional note (esp. on reject)
  created_at timestamptz not null default now()
);
create index if not exists content_feedback_idx
  on content_feedback(entity_key, kind, created_at desc);

alter table content_feedback enable row level security;
do $$ begin
  execute 'drop policy if exists "read for authenticated" on content_feedback';
  execute 'create policy "read for authenticated" on content_feedback for select to authenticated using (true)';
end $$;

-- Distilled style preferences reuse brand_knowledge (kind='preference', source='feedback').
