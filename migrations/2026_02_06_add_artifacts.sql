create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  kind text not null check (kind in ('image','text','model','other')),
  path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists artifacts_run_idx on artifacts(run_id);
create index if not exists artifacts_kind_idx on artifacts(kind);
