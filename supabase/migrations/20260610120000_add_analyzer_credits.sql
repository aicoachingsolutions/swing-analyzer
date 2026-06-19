-- Video credit balance for the Swing Analyzer.
-- Free accounts get 2 lifetime video breakdowns (metered via analyzer_usage).
-- After that, a user needs Pro (unlimited) OR credits bought via Stripe packs.
-- Apply to the SAME Supabase project as the practice planner. Idempotent.
-- Service-role only (RLS on, no public policies).

create table if not exists public.analyzer_credits (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  balance     integer not null default 0,
  updated_at  timestamptz not null default timezone('utc', now()),
  constraint analyzer_credits_balance_nonneg check (balance >= 0)
);

alter table public.analyzer_credits enable row level security;
-- No policies on purpose: only the service role (server) touches this table.

-- Atomic decrement: never drops below zero; returns the new balance (or null if
-- there was nothing to spend).
create or replace function public.decrement_analyzer_credit(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.analyzer_credits
     set balance = balance - 1,
         updated_at = timezone('utc', now())
   where user_id = p_user_id
     and balance > 0
  returning balance;
$$;

-- Add credits (Stripe webhook calls this after a successful pack purchase).
create or replace function public.add_analyzer_credits(p_user_id uuid, p_amount integer)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.analyzer_credits (user_id, balance)
  values (p_user_id, greatest(p_amount, 0))
  on conflict (user_id)
  do update set balance = public.analyzer_credits.balance + greatest(p_amount, 0),
                updated_at = timezone('utc', now())
  returning balance;
$$;
