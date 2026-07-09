-- Per-company access control (multi-tenant). Run after 0001–0005. Safe to re-run.

-- Who can access what. email → role + which brands (companies) they may see.
-- Owners see everything; partners see only their listed brands.
create table if not exists memberships (
  email      text primary key,          -- lowercased login email
  role       text not null default 'partner' check (role in ('owner','partner')),
  brands     text[] not null default '{}',  -- entity keys the partner may access
  created_at timestamptz not null default now()
);
alter table memberships enable row level security;
-- (no policies — service-role only; the app resolves access server-side)

-- Daily Brief becomes per-scope: null entity_key = portfolio (owners); a brand key = that brand.
alter table daily_briefs add column if not exists entity_key text;
