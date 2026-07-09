-- Seed the three brands. Safe to run repeatedly.
insert into entities (key, name, color) values
  ('macaws',                'macaws.ai',            '#2563eb'),
  ('artificial-ignorance',  'Artificial Ignorance', '#10b981'),
  ('leonardo',              'Leonardo',             '#f59e0b')
on conflict (key) do update
  set name = excluded.name,
      color = excluded.color;
