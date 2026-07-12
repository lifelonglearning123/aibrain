-- Knowledge documents — long-form knowledge ingested from Loom recap emails (and
-- future sources). The distilled insights still live in brand_knowledge; this
-- table keeps the full source text for the record + future retrieval. Run after
-- 0001–0007. Safe to re-run.

create table if not exists knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'loom',   -- loom | ...
  external_id text,                            -- loom video id (dedupe key)
  entity_key  text,                            -- classified brand, or null = shared
  scope       text not null default 'shared',  -- shared | brand
  title       text,
  url         text,                            -- loom video link
  summary     text,
  content     text,                            -- full recap (summary + action items + notes)
  occurred_at timestamptz,                     -- meeting date
  created_at  timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists knowledge_documents_idx
  on knowledge_documents(source, entity_key, occurred_at desc);

alter table knowledge_documents enable row level security;
do $$ begin
  execute 'drop policy if exists "read for authenticated" on knowledge_documents';
  execute 'create policy "read for authenticated" on knowledge_documents for select to authenticated using (true)';
end $$;
