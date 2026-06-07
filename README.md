# Swing Analyzer — AI Coaching Solutions

The free/Pro AI swing & pitching analyzer. A separate Next.js app that **shares
the practice planner's Supabase project** (same accounts, subscriptions, and
stats), deployed at **`analyzer.aicoachingsolutions.net`**.

> This repo is the analyzer only. It does **not** contain the practice planner.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase Auth via `@supabase/ssr` (shared session with the platform)
- OpenAI (`gpt-4o-mini`) — the sport-framework coaching engine
- Tiered access read from the platform's `public.subscriptions` table

## Access tiers (Phase 1)

| Tier | Detected by | Limit | Video |
|------|-------------|-------|-------|
| Anonymous | no session | 2 / day (per IP) | ✗ |
| Free | Supabase user, no active paid sub | 5 / month | ✗ |
| Pro | `subscriptions.plan_type` paid/pro/trial + active | 25 / month | ✓ (Phase 2) |

Edit the numbers in `src/lib/tiers.ts`.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — **from the same Supabase project as the practice planner**
   - `OPENAI_API_KEY`
   - `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` — your domain mailbox (e.g. SiteGround) to enable emailing breakdowns + lead capture
   - `NEXT_PUBLIC_COOKIE_DOMAIN` — blank for local; `.aicoachingsolutions.net` in production only
3. `npm run dev`

## Database

Apply the analyzer's migrations to the shared Supabase project (CLI, or paste
each into the Supabase SQL Editor):

```bash
supabase db push
# 20260607120000_add_analyzer_usage.sql  — usage metering
# 20260607130000_add_analyzer_leads.sql  — emailed-breakdown lead capture
```

## Shared login (one account across the platform)

For a session created on the practice planner to carry to this subdomain, **both
apps must set the Supabase auth cookie `domain` to `.aicoachingsolutions.net`.**
This app does it via `NEXT_PUBLIC_COOKIE_DOMAIN`. In the practice planner repo,
set the same `domain` in its `lib/supabase/server.ts`, `client.ts`, and
`middleware.ts` cookie options.

## Deploy

- New Vercel project from this repo.
- Add the env vars above.
- Add domain `analyzer.aicoachingsolutions.net` (CNAME → `cname.vercel-dns.com`
  in SiteGround DNS).

## Roadmap

- **Phase 1 (done):** text analyzer + tiered metering (anon/free/Pro).
- **Delivery (done):** email any breakdown (all tiers → captures the lead in
  `analyzer_leads`); download branded PDF (Pro only, server-gated).
- **Phase 2:** Pro video upload → Supabase Storage → frame sampling → vision
  analysis; retention (process-and-discard free, retain for Pro, cron cleanup).
- **Phase 3:** write `result.metrics` into the central stats layer
  (`team_stat_reports` / `team_stat_values`, `source_app='swing_analyzer'`,
  `subject_type='player'`) so the Team Analyzer can trend an athlete — after the
  Practice Planner roster exists.
