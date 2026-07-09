-- AI Brain — initial schema
-- Multi-entity (3 brands) sales & marketing warehouse.
-- Run in Supabase → SQL Editor, or via the Supabase CLI (see SETUP.md).

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Brands / entities
-- ─────────────────────────────────────────────────────────────
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  name       text not null,
  color      text not null default '#2563eb',
  created_at timestamptz not null default now()
);

-- Integrations wired per entity.
-- NOTE: no raw secrets here — secret_ref names the env var holding the key.
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

-- ─────────────────────────────────────────────────────────────
-- Contacts / leads
-- ─────────────────────────────────────────────────────────────
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  source      text not null,
  external_id text,
  name        text,
  email       text,
  phone       text,
  channel     text,                 -- lead source / marketing channel
  tags        text[],
  created_at  timestamptz,
  raw         jsonb,
  synced_at   timestamptz not null default now(),
  unique (entity_id, source, external_id)
);
create index if not exists contacts_entity_idx  on contacts(entity_id);
create index if not exists contacts_channel_idx on contacts(entity_id, channel);

-- ─────────────────────────────────────────────────────────────
-- Deals / opportunities (pipeline)
-- ─────────────────────────────────────────────────────────────
create table if not exists deals (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid references entities(id) on delete cascade,
  source              text not null,
  external_id         text,
  contact_external_id text,
  pipeline            text,
  stage               text,
  status              text,          -- open / won / lost / abandoned
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

-- ─────────────────────────────────────────────────────────────
-- Revenue events (Stripe charges/subscriptions, QuickBooks invoices/expenses)
-- ─────────────────────────────────────────────────────────────
create table if not exists revenue_events (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  source      text not null,
  external_id text,
  type        text,                  -- charge / subscription / invoice / refund / expense
  amount_cents bigint not null default 0,
  currency    text default 'GBP',
  customer_ref text,
  occurred_at timestamptz,
  raw         jsonb,
  synced_at   timestamptz not null default now(),
  unique (entity_id, source, external_id)
);
create index if not exists revenue_entity_time_idx on revenue_events(entity_id, occurred_at);

-- ─────────────────────────────────────────────────────────────
-- Precomputed daily metrics (fast trend charts)
-- ─────────────────────────────────────────────────────────────
create table if not exists metrics_daily (
  id        uuid primary key default gen_random_uuid(),
  entity_id uuid references entities(id) on delete cascade,
  date      date not null,
  metric    text not null,           -- mrr / new_leads / revenue / channel:<x> ...
  value     numeric not null default 0,
  unique (entity_id, date, metric)
);
create index if not exists metrics_daily_idx on metrics_daily(entity_id, metric, date);

-- ─────────────────────────────────────────────────────────────
-- Sync run log
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- AI insight digests
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- Internal team model: any authenticated user can READ.
-- WRITES happen server-side with the service-role key (bypasses RLS).
-- ─────────────────────────────────────────────────────────────
alter table entities       enable row level security;
alter table connections    enable row level security;
alter table contacts       enable row level security;
alter table deals          enable row level security;
alter table revenue_events enable row level security;
alter table metrics_daily  enable row level security;
alter table sync_runs      enable row level security;
alter table insights       enable row level security;

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
