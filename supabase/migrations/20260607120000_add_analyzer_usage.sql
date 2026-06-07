-- Swing Analyzer usage metering.
-- Apply to the SAME Supabase project as the practice planner.
-- Idempotent. The analyzer reads/writes this table with the service-role key
-- (which bypasses RLS), so RLS is enabled with no public policies — usage data
-- is not readable by anon/authenticated clients.

create table if not exists public.analyzer_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,  -- null = anonymous
  ip          text,                                               -- used for anonymous limiting
  kind        text not null default 'text',                       -- 'text' | 'video'
  status      integer not null default 200,
  created_at  timestamptz not null default timezone('utc', now()),
  constraint analyzer_usage_kind_check check (kind in ('text', 'video'))
);

create index if not exists analyzer_usage_user_idx
  on public.analyzer_usage (user_id, created_at desc);
create index if not exists analyzer_usage_ip_idx
  on public.analyzer_usage (ip, created_at desc);

alter table public.analyzer_usage enable row level security;
-- No policies on purpose: only the service role (server) touches this table.
