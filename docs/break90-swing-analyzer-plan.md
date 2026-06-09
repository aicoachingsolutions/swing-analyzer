# Break90 Swing Analyzer — Future Build Plan

> **Status:** Decided, NOT built. Reference this when ready to build.
> **Decision date:** 2026-06
> **Decision:** Break90 gets its own **separate, native** golf swing analyzer. It is
> NOT connected to the Coach Platform analyzer — the two stay separate by design.

---

## The decision

There will be **two separate swing analyzers**, split by sport along the two product lines:

| | Coach Platform analyzer (built) | Break90 analyzer (future) |
|---|---|---|
| Sports | Baseball / Softball (golf = funnel only) | **Golf** |
| Lives on | `analyzer.aicoachingsolutions.net` | **Inside Break90** |
| Auth | Supabase (shared coach login) | **Firebase** (Break90's own) |
| Billing / gating | Coach Pro (`subscriptions` table) | **Break90's own subscription** |
| Data | Coach central stats (`team_stat_*`) | **Break90's own per-golfer data** |

**Why separate:** Break90 is a standalone product (Family B) on a different stack
(Firebase, own billing, own data). It deliberately does NOT share auth/billing/data
with the Coach Platform (Family A). Trying to bridge Supabase ↔ Firebase is the worst
of both worlds. Native-in-Break90 is cleaner.

---

## The ONE critical rule when building it

**Share the engine, not the plumbing.**

- The sport-framework "brain" (the analysis logic) currently lives in this repo at
  `src/lib/coaching-engine.ts` (frameworks, prompt, structured `metrics` output).
- Do **NOT** re-write/fork that brain inside Break90. A prompt fix would then have to
  happen in two places.
- **Extract the coaching engine into one shared module/package** that both the Coach
  analyzer and Break90 import. Write the brain once, wrap it twice:
  - Coach analyzer wraps it with Supabase auth + Coach Pro gating + coach stats.
  - Break90 wraps it with Firebase auth + Break90 billing + Break90 data.

---

## What "native in Break90" gets us

- **No cross-stack pain** — no Firebase↔Supabase token exchange, no shared-cookie
  gymnastics. Break90 already knows who's logged in and who paid; gating is trivial.
- **Richer analysis** — it can use what Break90 already knows about the golfer (rounds,
  scoring leaks, history), instead of analyzing a clip in a vacuum.
- **Clean monetization** — it's a Break90 Pro feature that drives the Break90 founders
  subscription; doesn't muddy Coach Pro.
- **Clean product line** — baseball/softball → Coach Platform, golf → Break90.

## What it costs (plan for these)

- A second build on Break90's stack: upload, **Firebase Storage** (not Supabase),
  retention/auto-delete, usage metering — rebuilt in Break90.
- Risk of duplicating the engine → mitigated by the shared-module rule above.
- Two "swing analyzers" to keep straight (see roles below).

---

## Roles (avoid brand confusion)

- **Free public analyzer** (`analyzer.aicoachingsolutions.net`) = the lead-magnet
  taste/funnel. Its golf mode points golfers toward Break90.
- **Break90 analyzer** = the real, paid golf analysis inside the product.

Keep these distinct in marketing/SEO so it's clear which is "the" analyzer.

---

## Build sequence

- **Not day one.** Pre-launch, the free analyzer + funnel to Break90 is enough.
- Build the Break90-native analyzer as a **post-traction premium feature**.
- When building:
  1. Extract `coaching-engine.ts` into a shared package both apps import.
  2. Build the Break90 front door: Firebase auth + Break90 billing gate.
  3. Photo/video upload → Firebase Storage + retention/auto-delete.
  4. Write results into Break90's **own per-golfer data** so future Break90 features
     (swing trends over time) can read them — same "spine" idea as the coach platform,
     but Break90's own.

---

## Cross-reference
- Coach Platform analyzer + shared engine: this repo (`swing-analyzer`),
  `src/lib/coaching-engine.ts`.
- Platform roadmap (Family A vs Family B split): practice-planner repo
  `docs/platform-roadmap.md`.
