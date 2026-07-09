-- App credentials entered from the Settings page.
-- Secrets: RLS ON with NO policies → service-role only (server), never the browser.
-- The Settings UI only ever shows whether a value is set, never the value itself.

create table if not exists app_credentials (
  name       text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table app_credentials enable row level security;
-- (intentionally no policies — service role only)
