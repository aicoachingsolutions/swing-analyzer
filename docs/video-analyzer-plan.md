# Video Analyzer — Game Plan (Pro feature)

> The paid analyzer's video capability for golf, baseball, and softball. Builds on
> the live text analyzer (Phase 1 done) and the tier system already in
> `src/lib/tiers.ts` + `src/lib/usage.ts`. Gated to **Pro**.

## Guiding principle
**Make upload-and-feedback seamless before investing in biomechanics.** A clean
"upload a clip → get pro-quality coaching feedback in under a minute" loop feels
impressive on its own — even with zero pose tracking. Advanced analysis (angles,
scoring, model comparison) is a later moat, not the MVP. Ship the seamless core first.

---

## The three versions (honest scope)

### Version 1 — Upload & Feedback ← BUILD THIS
- Video upload → extract key frames → **vision-grounded** AI coaching feedback → save history.
- **Effort: moderate. No ML.** Reuses the existing sport-framework coaching engine + the
  tier gating that's already wired.
- **Cost:** vision API per analysis (Pro-only, bounded) + a little storage.
- **Why first:** it's the entire value prop ("show, don't type") with the least infra.

### Version 2 — Visual overlays & progress (after V1 has traction)
- Draw posture/angle lines on frames; compare swings over time; highlight improvements.
- **Effort: higher** — needs pose **keypoints** (lightweight, client-side: MediaPipe /
  MoveNet) to draw angles. Comparison reuses V1 history.
- **Cost:** mostly client compute (free) + storage.

### Version 3 — Biomechanics & scoring (the long game)
- Full per-frame pose tracking, automatic scoring, compare against model swings.
- **Effort: heavy** — real ML, a curated "model swing" reference library per sport, and a
  scoring rubric.
- **Cost:** compute + curation. This is the differentiated moat — invest once V1/V2 prove out.

---

## Version 1 — detailed build

### Architecture (fits the Vercel + Supabase you already run)
1. **Upload:** client → **Supabase Storage** via a signed upload URL. Never POST the video
   through an API route — videos exceed Vercel's ~4.5 MB serverless body limit. Direct-to-Storage
   sidesteps that entirely.
2. **Frame extraction — client-side:** grab frames from the uploaded/selected clip with HTML5
   `<video>` + `<canvas>` at chosen timestamps. **No server ffmpeg, no ffmpeg.wasm needed** for
   the MVP. (Revisit server-side extraction only if quality demands it.)
3. **Analysis:** POST the extracted **frame images** to `/api/analyze` → the existing
   sport-framework engine, now **vision-enabled** (the model sees the frames). Same structured
   output (`mechanics / timing / cues / nextFocus / drill`), now grounded in what's visible.
4. **History (Pro):** store analysis + frame thumbnails + a video reference in a new
   `analyzer_analyses` table (RLS, owner = `auth.uid()`), following the migration/RLS pattern in
   the practice-planner repo.
5. **Retention:** free = process-and-discard (video is Pro-only anyway); Pro = retain; a nightly
   cleanup cron removes orphaned/expired media to control storage cost.

### Capture UX — the make-or-break
The hard part is **not** the AI; it's getting a usable clip. Design for it:
- Tell the user the **angle** (face-on vs. down-the-line show different faults) and to film the
  **whole** swing.
- **Auto-sample ~3–6 frames** evenly across the clip, OR let them scrub and mark
  setup / contact(release) / finish.
- **Show the extracted frames back** so they confirm before analyzing ("are these the right
  moments?"). This one step makes the product feel smart and prevents garbage-in.

### Gating (already wired — reuse it)
- `tiers.ts`: Pro `video: true` is already set; Pro is now **unlimited** (`pro-unlimited` branch).
- `usage.ts`: `logUsage(..., kind: "video", ...)` already accepts the video kind.
- Anonymous / Free → video blocked, show upgrade prompt. **Server-gate** the video path
  (re-check tier server-side; never trust the client).

### Model
- Use a **vision-capable** model for the frame step (the analyzer's `gpt-5.4-mini` if it accepts
  images; otherwise `gpt-4o` for the vision call). Extend the existing prompt: *"Here are N frames
  of a {sport} {motion}; analyze using the framework below."*

---

## Cost model (rough)
- **Vision analysis:** a few cents per run — more than text, but Pro-only and covered many times
  over by the subscription.
- **Storage:** pennies/GB-month; retention policy keeps it small (frames are tiny; consider
  keeping only frames + analysis, discarding the source video, for both cost and privacy).

---

## Open decisions
1. **Frame strategy:** auto-sample vs. user-marked key moments. *Recommend: auto-sample, let them
   adjust.*
2. **Keep the video, or only the extracted frames + analysis?** Frames-only is cheaper and more
   private. *Lean frames-only.*
3. **Which model** runs the vision step.
4. **Limits:** max clip length / size (e.g., 15 s, 50 MB) to bound cost and upload time.

---

## Sequence
1. **V1**: upload → frames → vision feedback → Pro history. Ship the seamless core.
2. Watch usage + free→Pro conversion.
3. **V2**: overlays + compare-over-time, once V1 has traction.
4. **V3**: pose tracking + scoring + model-swing comparison — the long-term moat.

## Ties into the platform
Per the README roadmap, Phase 3 writes `result.metrics` into the central stats layer
(`team_stat_reports` / `team_stat_values`, `source_app='swing_analyzer'`, `subject_type='player'`)
so the Team Analyzer can trend an athlete over time. Video V1 produces richer metrics to feed that
loop later — but don't block V1 on it.
