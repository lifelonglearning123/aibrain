-- Daily Brief — the pre-generated morning briefing. Run after 0001–0004.

create table if not exists daily_briefs (
  id         uuid primary key default gen_random_uuid(),
  content    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists daily_briefs_created_idx on daily_briefs(created_at desc);

alter table daily_briefs enable row level security;
drop policy if exists "read for authenticated" on daily_briefs;
create policy "read for authenticated" on daily_briefs for select to authenticated using (true);
-- Writes happen server-side with the service-role key.
