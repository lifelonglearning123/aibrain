-- OAuth token store (QuickBooks, and any future OAuth apps).
-- Tokens are secrets: this table has RLS ON with NO policies, so only the
-- service-role key (which bypasses RLS, used server-side) can read/write it.
-- The browser can never reach these rows.

create table if not exists oauth_connections (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,               -- 'quickbooks'
  entity_key    text not null,               -- brand key (matches entities.key)
  realm_id      text,                        -- QuickBooks company id
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  unique (provider, entity_key)
);

alter table oauth_connections enable row level security;
-- (intentionally no policies — service role only)
