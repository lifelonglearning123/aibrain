-- Self-learning: knowledge base, teach-the-brain notes, and a run log.
-- Run this in Supabase → SQL Editor (after 0001–0003). Safe to run again.

-- Anonymised insights the brain has learned (per brand or shared across the portfolio).
create table if not exists brand_knowledge (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null default 'shared' check (scope in ('brand','shared')),
  entity_key    text,                 -- null for shared
  kind          text not null,        -- pain_point | objection | faq | winning_phrase | topic
  text          text not null,
  converts      boolean not null default false,  -- associated with a booking/positive outcome
  evidence_count integer not null default 1,
  source        text not null default 'signal',  -- signal | ghl | note
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists brand_knowledge_idx on brand_knowledge(scope, entity_key, kind);

-- "Teach the brain" — free-text observations you type in.
create table if not exists brand_notes (
  id         uuid primary key default gen_random_uuid(),
  entity_key text,
  text       text not null,
  created_at timestamptz not null default now()
);

-- Audit log of each learning pass.
create table if not exists learning_runs (
  id              uuid primary key default gen_random_uuid(),
  entity_key      text,
  source          text,
  calls_seen      integer default 0,
  insights_written integer default 0,
  status          text not null default 'success',
  error           text,
  created_at      timestamptz not null default now()
);

alter table brand_knowledge enable row level security;
alter table brand_notes     enable row level security;
alter table learning_runs   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['brand_knowledge','brand_notes','learning_runs']
  loop
    execute format('drop policy if exists "read for authenticated" on %I;', t);
    execute format(
      'create policy "read for authenticated" on %I for select to authenticated using (true);', t);
  end loop;
end $$;
-- Writes happen server-side with the service-role key (bypasses RLS).
