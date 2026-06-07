-- Swing Analyzer lead capture — every emailed breakdown saves the contact.
-- This is the marketing list the free analyzer exists to build.
-- Apply to the SAME Supabase project. Idempotent. Service-role only (RLS on,
-- no public policies).

create table if not exists public.analyzer_leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  user_id     uuid references auth.users (id) on delete set null,  -- null = anonymous
  ip          text,
  sport       text,
  motion      text,
  main_issue  text,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists analyzer_leads_email_idx on public.analyzer_leads (email);
create index if not exists analyzer_leads_ip_idx on public.analyzer_leads (ip, created_at desc);
create index if not exists analyzer_leads_created_idx on public.analyzer_leads (created_at desc);

alter table public.analyzer_leads enable row level security;
-- No policies on purpose: only the service role (server) reads/writes leads.
