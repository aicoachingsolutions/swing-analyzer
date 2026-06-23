-- Maps a user to their Stripe customer/subscription so webhook lifecycle events
-- (renewals, cancellations) can find the right account. Entitlement itself lives
-- in the shared public.subscriptions table; this is just the Stripe linkage.
-- Apply to the SAME Supabase project. Idempotent. Service-role only.

create table if not exists public.analyzer_billing (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  updated_at              timestamptz not null default timezone('utc', now())
);

create index if not exists analyzer_billing_customer_idx
  on public.analyzer_billing (stripe_customer_id);

alter table public.analyzer_billing enable row level security;
-- No policies: only the service role (server/webhook) touches it.
