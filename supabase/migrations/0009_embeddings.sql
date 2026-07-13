-- Semantic search over learned insights. Enables Ask-your-data to retrieve the
-- most relevant insights per question instead of dumping all of them into the
-- prompt (essential now there are thousands). Run after 0001–0008. Safe to re-run.

create extension if not exists vector;

alter table brand_knowledge add column if not exists embedding vector(1536);

-- HNSW index for fast cosine nearest-neighbour search.
create index if not exists brand_knowledge_embedding_idx
  on brand_knowledge using hnsw (embedding vector_cosine_ops);

-- Access-scoped similarity search. allowed_brands = the caller's brands;
-- include_shared = whether to include portfolio-wide 'shared' insights (owners only).
create or replace function match_brand_knowledge(
  query_embedding vector(1536),
  match_count int,
  allowed_brands text[],
  include_shared boolean
) returns table (
  kind text, text text, converts boolean, scope text, entity_key text, similarity float
)
language sql stable as $$
  select bk.kind, bk.text, bk.converts, bk.scope, bk.entity_key,
         1 - (bk.embedding <=> query_embedding) as similarity
  from brand_knowledge bk
  where bk.status = 'active'
    and bk.embedding is not null
    and (
      (bk.scope = 'shared' and include_shared)
      or (bk.scope = 'brand' and bk.entity_key = any(allowed_brands))
    )
  order by bk.embedding <=> query_embedding
  limit match_count;
$$;
