-- Swing Analyzer video credits ledger.
-- Apply to the SAME Supabase project. Idempotent. Service-role only (RLS on,
-- no public policies — only the server touches it).
--
-- Model:
--   * New account gets 2 free video breakdowns (granted on first use).
--   * Swing Pack ($4.99) adds 5 credits (via Stripe webhook, later).
--   * Pro members don't draw from credits — they get 20/month (counted from
--     analyzer_usage where kind='video').

create table if not exists public.analyzer_credits (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  balance       integer not null default 0,
  free_granted  boolean not null default false,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

alter table public.analyzer_credits enable row level security;
-- No policies: only the service role (server) reads/writes credits.
