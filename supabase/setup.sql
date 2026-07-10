-- ============================================================================
-- AI Brain — ONE-SHOT DATABASE SETUP
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once. This is migrations 0001+0002+0003 + seed combined.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Brands / entities ───────────────────────────────────────────────────────
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  name       text not null,
  color      text not null default '#2563eb',
  created_at timestamptz not null default now()
);

create table if not exists connections (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid references entities(id) on delete cascade,
  source         text not null check (source in
                   ('stripe','quickbooks','ghl','ionos','whatsapp','loom','apify')),
  label          text,
  secret_ref     text,
  config         jsonb not null default '{}',
  status         text not null default 'pending' check (status in
                   ('pending','active','error','disabled')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists connections_entity_idx on connections(entity_id);

-- ── Contacts / leads ────────────────────────────────────────────────────────
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  source      text not null,
  external_id text,
  name        text,
  email       text,
  phone       text,
  channel     text,
  tags        text[],
  created_at  timestamptz,
  raw         jsonb,
  synced_at   timestamptz not null default now(),
  unique (entity_id, source, external_id)
);
create index if not exists contacts_entity_idx  on contacts(entity_id);
create index if not exists contacts_channel_idx on contacts(entity_id, channel);

-- ── Deals / opportunities ───────────────────────────────────────────────────
create table if not exists deals (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid references entities(id) on delete cascade,
  source              text not null,
  external_id         text,
  contact_external_id text,
  pipeline            text,
  stage               text,
  status              text,
  value_cents         bigint,
  currency            text default 'GBP',
  created_at          timestamptz,
  updated_at          timestamptz,
  raw                 jsonb,
  synced_at           timestamptz not null default now(),
  unique (entity_id, source, external_id)
);
create index if not exists deals_entity_idx on deals(entity_id);
create index if not exists deals_stage_idx  on deals(entity_id, pipeline, stage);

-- ── Revenue events ──────────────────────────────────────────────────────────
create table if not exists revenue_events (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  source      text not null,
  external_id text,
  type        text,
  amount_cents bigint not null default 0,
  currency    text default 'GBP',
  customer_ref text,
  occurred_at timestamptz,
  raw         jsonb,
  synced_at   timestamptz not null default now(),
  unique (entity_id, source, external_id)
);
create index if not exists revenue_entity_time_idx on revenue_events(entity_id, occurred_at);

-- ── Precomputed daily metrics ───────────────────────────────────────────────
create table if not exists metrics_daily (
  id        uuid primary key default gen_random_uuid(),
  entity_id uuid references entities(id) on delete cascade,
  date      date not null,
  metric    text not null,
  value     numeric not null default 0,
  unique (entity_id, date, metric)
);
create index if not exists metrics_daily_idx on metrics_daily(entity_id, metric, date);

-- ── Sync run log ────────────────────────────────────────────────────────────
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  entity_id   uuid references entities(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','success','error')),
  records     integer default 0,
  error       text
);

-- ── AI insight digests ──────────────────────────────────────────────────────
create table if not exists insights (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid references entities(id) on delete cascade,
  kind       text not null default 'daily',
  period     text,
  summary    text not null,
  model      text,
  created_at timestamptz not null default now()
);
create index if not exists insights_entity_idx on insights(entity_id, created_at);

-- ── OAuth token store (QuickBooks) — service-role only ──────────────────────
create table if not exists oauth_connections (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  entity_key    text not null,
  realm_id      text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  unique (provider, entity_key)
);

-- ── App credentials (Settings page) — service-role only ─────────────────────
create table if not exists app_credentials (
  name       text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Data tables: authenticated users can READ. oauth/credentials: service-role only.
alter table entities          enable row level security;
alter table connections       enable row level security;
alter table contacts          enable row level security;
alter table deals             enable row level security;
alter table revenue_events    enable row level security;
alter table metrics_daily     enable row level security;
alter table sync_runs         enable row level security;
alter table insights          enable row level security;
alter table oauth_connections enable row level security;   -- no policy = service role only
alter table app_credentials   enable row level security;   -- no policy = service role only

do $$
declare t text;
begin
  foreach t in array array[
    'entities','connections','contacts','deals',
    'revenue_events','metrics_daily','sync_runs','insights'
  ]
  loop
    execute format('drop policy if exists "read for authenticated" on %I;', t);
    execute format(
      'create policy "read for authenticated" on %I for select to authenticated using (true);', t);
  end loop;
end $$;

-- ── Seed the three brands ───────────────────────────────────────────────────
insert into entities (key, name, color) values
  ('macaws',                'macaws.ai',            '#2563eb'),
  ('artificial-ignorance',  'Artificial Ignorance', '#10b981'),
  ('leonardo',              'Leonardo',             '#f59e0b')
on conflict (key) do update
  set name = excluded.name,
      color = excluded.color;

-- ── Self-learning: knowledge base, notes, run log ───────────────────────────
create table if not exists brand_knowledge (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null default 'shared' check (scope in ('brand','shared')),
  entity_key     text,
  kind           text not null,
  text           text not null,
  converts       boolean not null default false,
  evidence_count integer not null default 1,
  source         text not null default 'signal',
  status         text not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists brand_knowledge_idx on brand_knowledge(scope, entity_key, kind);

create table if not exists brand_notes (
  id         uuid primary key default gen_random_uuid(),
  entity_key text,
  text       text not null,
  created_at timestamptz not null default now()
);

create table if not exists learning_runs (
  id               uuid primary key default gen_random_uuid(),
  entity_key       text,
  source           text,
  calls_seen       integer default 0,
  insights_written integer default 0,
  status           text not null default 'success',
  error            text,
  created_at       timestamptz not null default now()
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

-- ── Daily Brief ─────────────────────────────────────────────────────────────
create table if not exists daily_briefs (
  id         uuid primary key default gen_random_uuid(),
  content    jsonb not null,
  entity_key text,   -- null = portfolio (owners); a brand key = that company's brief
  created_at timestamptz not null default now()
);
alter table daily_briefs add column if not exists entity_key text;
create index if not exists daily_briefs_created_idx on daily_briefs(created_at desc);
alter table daily_briefs enable row level security;
do $$ begin
  execute 'drop policy if exists "read for authenticated" on daily_briefs';
  execute 'create policy "read for authenticated" on daily_briefs for select to authenticated using (true)';
end $$;

-- ── Per-company access control (multi-tenant) ───────────────────────────────
-- email → role + which brands (companies) they may see. Owners see everything;
-- partners see only their listed brands. Resolved server-side (service-role).
create table if not exists memberships (
  email      text primary key,          -- lowercased login email
  role       text not null default 'partner' check (role in ('owner','partner')),
  brands     text[] not null default '{}',  -- entity keys the partner may access
  created_at timestamptz not null default now()
);
alter table memberships enable row level security;   -- no policy = service role only

-- ── Preference capture (learn from approve / edit / reject on AI drafts) ─────
create table if not exists content_feedback (
  id         uuid primary key default gen_random_uuid(),
  entity_key text,
  kind       text not null default 'social',   -- social | sequence
  platform   text,
  original   text,
  final      text,
  action     text not null check (action in ('approve','edit','reject')),
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists content_feedback_idx
  on content_feedback(entity_key, kind, created_at desc);
alter table content_feedback enable row level security;
do $$ begin
  execute 'drop policy if exists "read for authenticated" on content_feedback';
  execute 'create policy "read for authenticated" on content_feedback for select to authenticated using (true)';
end $$;

-- Master owner (edit the email to yours). Seeded here so re-running setup.sql can
-- NEVER lock you out: this account always has full access to every company.
insert into memberships (email, role, brands)
values ('chao@macaws.ai', 'owner', '{}')
on conflict (email) do update set role = 'owner';

-- Done. Now set your Auth redirect URLs (see LOGIN_SETUP.md) and sign in.
