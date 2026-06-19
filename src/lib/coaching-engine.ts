import OpenAI from "openai";
import { z } from "zod";

/**
 * The sport-framework coaching engine.
 *
 * Ported from the original free-breakdown route so the coaching intelligence is
 * written ONCE and reused (text now, photo/video later, other tools after).
 * "One engine, many front doors."
 */

export const BREAKDOWN_SPORTS = ["golf", "baseball", "softball"] as const;
export const BREAKDOWN_MOTIONS = ["swing", "pitching"] as const;

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /system\s+prompt/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /forget\s+(your\s+)?instructions/i,
  /disregard\s+(all\s+)?/i,
  /new\s+instructions\s*:/i,
  /jailbreak/i,
  /pretend\s+(you\s+are|to\s+be)/i,
];

export function hasInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

const FRAMEWORKS: Record<string, string> = {
  baseball_swing: `
Kinetic sequence (ground up): load & hand set -> stride with hip/hand separation -> lower half launches (back hip rotates into a firm front leg) -> torso follows -> lead arm pulls the barrel into the slot -> palm-up/palm-down through contact -> extension to a high finish.
Common fault -> root cause: rolling over / weak grounders = casting or early wrist roll from the upper half rushing; pulling off / opening early = front shoulder and hip flying open together with no separation; chopping or swinging under = steep, disconnected barrel; lunging = drifting onto a soft front leg.
Recognized drills: tee work (inside/outside, high/low tee), bottom-hand & top-hand isolation, connection ball or towel-under-lead-arm, walk-through stride drill, wall drill (no barrel contact), high-tee for steep swings, timed soft toss, band-resisted hip turn.`,

  softball_swing: `
Kinetic sequence (ground up): load & hand set -> short stride with hip/hand separation -> back hip rotates into a firm front leg -> torso follows -> lead arm pulls the barrel into the slot -> through contact -> extension and finish. Reaction window is short, so emphasize staying short to the ball and adjusting to pitch height (rise/drop/change).
Common fault -> root cause: rolling over / weak grounders = casting or early wrist roll from rushing the hands; pulling off the ball = front side flying open with no separation; late / beaten by rise = long, steep path or late launch; lunging = drifting onto a soft front side.
Recognized drills: tee work (inside/outside, high/low tee), bottom-hand & top-hand isolation, connection ball or towel-under-lead-arm, walk-through stride drill, wall drill, high-tee for steep swings, timed front toss, band-resisted hip turn.`,

  baseball_pitching: `
This is OVERHAND pitching. Kinetic sequence: balanced leg lift -> controlled descent into the legs -> directional stride to the plate -> hip-to-shoulder separation (hips open while the throwing shoulder stays back) -> trunk rotation -> arm acceleration to release -> deceleration over a firm, braced front leg -> follow-through.
Common fault -> root cause: ball up / loss of command = rushing (upper half beats the lower half) or a soft, early-landing front leg; arm drag or low slot = late arm and poor hip-shoulder separation; flying open = glove side pulling out early and head drifting off line; inconsistent release = an unstable front-side block.
Recognized drills: towel drill, wall / front-side drill, balance-point holds, hip-shoulder separation ("sit and rip"), med-ball rotational throws and overhead slams, one-knee and rocker throws, walking windups, glove-side block drill.`,

  softball_pitching: `
This is WINDMILL (underhand) pitching — do NOT give overhand cues. Kinetic sequence: presentation -> explosive drive off the rubber (long stride, stay low) -> full windmill arm circle (arm long and loose, no elbow bend) -> hips fire and internally rotate as the arm comes down -> brush contact at the hip with a fast wrist/forearm snap -> snap through release -> balanced follow-through as the back foot replants.
Common fault -> root cause: lost velocity / "muscling" = bending the elbow in the circle or no leg drive (arm-only); rise or drop won't break = no hip snap or no brush contact at release; control issues = hips opening too early or inconsistent stride direction.
Recognized drills: K-position / "K-drill," wall arm-circle isolation, wrist- and forearm-snap drills at the hip, figure-8s, one-knee snaps, brush-the-hip drill (tape/chalk on the hip), resistance-band internal rotation, full-motion walk-throughs.`,

  golf_swing: `
Reason in terms of swing plane, club path, and clubface — not just where the ball ends up. Sequence & checkpoints: grip/setup/alignment -> one-piece takeaway -> wrist set on plane -> transition led by the lower body -> downswing with hips clearing while the club drops to the inside -> square face at impact with hands ahead (shaft lean) -> extension -> balanced finish.
Common fault -> root cause: slice / pull = over-the-top, out-to-in path from the upper body starting the downswing; fat or thin = early extension (standing up, losing posture) or casting / early release; sway or slide = lateral lower-body movement instead of rotation; flip = hands releasing early and losing shaft lean at impact.
Recognized drills: alignment-stick path/plane drills, headcover-outside-the-ball (anti-over-the-top), towel-under-both-arms connection, pump drill for transition, impact bag, feet-together drill for sequencing/balance, split-grip drill, lead-arm-only swings, step drill for ground-up sequencing.`,
};

function getFramework(sport: string, motion: string): string {
  return (
    FRAMEWORKS[`${sport}_${motion}`] ??
    `Reason from the sport's natural kinetic sequence (ground up), diagnose the earliest breakdown in that chain, and prescribe a recognized, sport-appropriate drill.`
  ).trim();
}

export const BreakdownRequestSchema = z.object({
  sport: z.enum(BREAKDOWN_SPORTS),
  motion: z.enum(BREAKDOWN_MOTIONS),
  handedness: z.enum(["left", "right"]).optional(),
  ageGroup: z.string().max(80).optional().default(""),
  skillLevel: z.string().max(60).optional().default(""),
  mainIssue: z
    .string()
    .min(20, "Please describe what you're seeing (at least 20 characters).")
    .max(600, "Description is too long — please keep it under 600 characters."),
  _hp: z.string().max(0, "Invalid request.").optional().default(""),
});

export type BreakdownInput = z.infer<typeof BreakdownRequestSchema>;

/**
 * `metrics` is the structured block that feeds the central stats layer later
 * (one swing analysis -> team_stat_values rows). The prose is for the coach;
 * these fields are app-agnostic data.
 */
export const BreakdownSchema = z.object({
  mechanics: z.string(),
  timing: z.string(),
  cues: z.array(z.string()).min(3).max(8),
  nextFocus: z.string(),
  drill: z.string(),
  metrics: z.object({
    primaryFault: z.string(),
    faultCategory: z.string(),
    severity: z.number().min(1).max(5),
    confidence: z.number().min(0).max(1),
  }),
});

export type BreakdownResult = z.infer<typeof BreakdownSchema>;

export async function runBreakdown(input: BreakdownInput): Promise<BreakdownResult> {
  const { sport, motion, handedness, ageGroup, skillLevel, mainIssue } = input;
  const framework = getFramework(sport, motion);
  const athleteProfile = `${ageGroup || "a developing"} athlete at a ${skillLevel || "developing"} level`;

  const system = `
You are a national-level ${sport} ${motion} coach and biomechanics specialist. A fellow coach has described what they are seeing with an athlete. Give them a breakdown sharp enough to run practice off it tonight.

HOW YOU THINK (reason from this sport framework):
${framework}

COACHING RUBRIC:
- Diagnose the ROOT CAUSE, not the symptom. Most described faults are downstream of one earlier breakdown in the kinetic sequence — find that link and lead with it.
- Trace the cause-and-effect chain explicitly (e.g., "X happens, which forces Y, producing the Z the coach described").
- Calibrate everything — rep counts, vocabulary, how much to cue at once — to ${athleteProfile}.
- Make cues FELT, not just seen: tie each to a sensation in the hands, hips, feet, barrel, or clubface.

WHAT TO AVOID:
- Generic cues that fit any athlete unless anchored to a specific feel or checkpoint.
- Hedging. Commit to the most likely root cause; if the description is thin, name the most common cause for that pattern and state the one thing to confirm in person.
- Trying to fix five things. Give ONE priority.

OUTPUT — valid JSON only:
- mechanics (4–6 sentences): the root cause and how it cascades into what the coach described; name exact joints, segments, and where in the sequence it breaks.
- timing (2–4 sentences): where in the kinetic sequence the timing breaks down, and what correct timing should feel like.
- cues (4–7 strings): short, vivid, athlete-facing.
- nextFocus (2–4 sentences): the single highest-leverage fix and why correcting it unlocks the rest.
- drill (4–6 sentences): an established, recognizable drill with setup + equipment, a rep/set count for ${athleteProfile}, the ONE thing to watch for, why it targets this root cause, and a progression.
- metrics: a structured summary for tracking — primaryFault (short label, e.g. "casting", "early_extension", "flying_open"), faultCategory (e.g. "upper_half_rush", "lower_half", "sequencing"), severity (1=minor to 5=severe), confidence (0–1 in your diagnosis).
`.trim();

  const handednessLine = handedness ? `Handedness: ${handedness}-handed\n` : "";
  const user = `
Sport: ${sport}
Motion: ${motion}
${handednessLine}Age group: ${ageGroup || "(not provided)"}
Skill level: ${skillLevel || "(not provided)"}
What the coach is seeing: ${mainIssue}

Task: Deliver a sharp, specific, high-quality coaching breakdown. Return valid JSON only.
`.trim();

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "breakdown",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            mechanics: { type: "string" },
            timing: { type: "string" },
            cues: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
            nextFocus: { type: "string" },
            drill: { type: "string" },
            metrics: {
              type: "object",
              additionalProperties: false,
              properties: {
                primaryFault: { type: "string" },
                faultCategory: { type: "string" },
                severity: { type: "number" },
                confidence: { type: "number" },
              },
              required: ["primaryFault", "faultCategory", "severity", "confidence"],
            },
          },
          required: ["mechanics", "timing", "cues", "nextFocus", "drill", "metrics"],
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "";
  return BreakdownSchema.parse(JSON.parse(content));
}

/* ─── Video (vision) breakdown — Pro feature ────────────────────────────────
   The client extracts key frames from the clip and sends them here. The vision
   model MUST ground every callout in a specific frame (proof of vision) and may
   only describe what is visible. Frames are passed in swing order. */

export const VideoBreakdownRequestSchema = z.object({
  sport: z.enum(BREAKDOWN_SPORTS),
  motion: z.enum(BREAKDOWN_MOTIONS),
  handedness: z.enum(["left", "right"]).optional(),
  ageGroup: z.string().max(80).optional().default(""),
  skillLevel: z.string().max(60).optional().default(""),
  // Optional with video — the frames are the primary input.
  mainIssue: z.string().max(600).optional().default(""),
  // Base64 data URLs of the extracted frames, in swing order (3–8).
  frames: z.array(z.string().min(1)).min(3).max(8),
  _hp: z.string().max(0, "Invalid request.").optional().default(""),
});

export type VideoBreakdownInput = z.infer<typeof VideoBreakdownRequestSchema>;

const FrameAnalysisSchema = z.object({
  index: z.number().int().min(0), // which uploaded frame (0-based, in order)
  phase: z.enum(["load", "stride", "contact", "finish", "other"]),
  observation: z.string(), // what is visible IN THIS FRAME, specific
  isKeyFault: z.boolean(), // the single "money frame" to annotate
  calloutLabel: z.string(), // short label drawn on the money frame ("" if none)
  region: z.object({ x: z.number(), y: z.number() }), // 0–1 anchor for the marker
});

export const VideoBreakdownSchema = BreakdownSchema.extend({
  // proof-of-vision: per-frame, frame-anchored analysis
  frames: z.array(FrameAnalysisSchema).min(1),
  // honesty: what angle/quality the model judged it could (and couldn't) assess
  angleNote: z.string(),
});

export type VideoBreakdownResult = z.infer<typeof VideoBreakdownSchema>;

export async function runVideoBreakdown(
  input: VideoBreakdownInput
): Promise<VideoBreakdownResult> {
  const { sport, motion, handedness, ageGroup, skillLevel, mainIssue, frames } = input;
  const framework = getFramework(sport, motion);
  const athleteProfile = `${ageGroup || "a developing"} athlete at a ${skillLevel || "developing"} level`;

  const system = `
You are a national-level ${sport} ${motion} coach and biomechanics specialist. You are shown ${frames.length} still frames extracted in order from a single clip of one athlete's ${motion}. Analyze the ACTUAL frames and give a breakdown sharp enough to run practice off tonight.

HOW YOU THINK (reason from this sport framework):
${framework}

PROOF OF VISION — this is mandatory:
- The frames are numbered 0..${frames.length - 1} in swing order. Tie EVERY observation to a specific frame index.
- Describe ONLY what is actually visible in the frames. Never invent a position you cannot see.
- Pick exactly ONE frame as the key fault frame (isKeyFault=true); set a short calloutLabel and a region {x,y} (0–1, where 0,0 is top-left) pointing at the body part to mark. All other frames: isKeyFault=false, calloutLabel "".
- Map each frame to a swing phase (load/stride/contact/finish/other).

HONESTY (build trust, don't fake it):
- If the angle or quality limits what you can judge, say so in angleNote (e.g. "Face-on angle, so I can't fully judge swing plane — film down-the-line for that."). Hedge when a frame is blurry or a body part is out of view. A confident wrong call is worse than an honest limitation.

COACHING RUBRIC:
- Diagnose the ROOT CAUSE, not the symptom; trace the cause-and-effect chain.
- Calibrate vocabulary and reps to ${athleteProfile}. Make cues FELT. Give ONE priority, not five.

OUTPUT — valid JSON only:
- frames: one entry per provided frame (index, phase, observation, isKeyFault, calloutLabel, region).
- angleNote: what the footage let you assess and what it didn't.
- mechanics (4–6 sentences): root cause + how it cascades, grounded in the frames.
- timing (2–4 sentences): where in the sequence it breaks down.
- cues (4–7 strings): short, vivid, athlete-facing.
- nextFocus (2–4 sentences): the single highest-leverage fix and why.
- drill (4–6 sentences): a recognized drill with setup, reps for ${athleteProfile}, the one thing to watch, why it targets this root cause, and a progression.
- metrics: primaryFault (short label), faultCategory, severity (1–5), confidence (0–1).
`.trim();

  const handednessLine = handedness ? `Handedness: ${handedness}-handed. ` : "";
  const intro =
    `Sport: ${sport}. Motion: ${motion}. ${handednessLine}` +
    `Athlete: ${ageGroup || "(age not provided)"}, ${skillLevel || "(skill not provided)"}. ` +
    (mainIssue ? `Coach also notes: ${mainIssue}. ` : "") +
    `The ${frames.length} frames follow in swing order. Return valid JSON only.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: intro },
    ...frames.map(
      (url): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
        type: "image_url",
        // "low" keeps token cost down; raise to "high" if accuracy needs it.
        image_url: { url, detail: "low" },
      })
    ),
  ];

  // Vision-capable model. Override with OPENAI_VISION_MODEL if the default text
  // model isn't multimodal.
  const model =
    process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "video_breakdown",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            frames: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  index: { type: "integer" },
                  phase: {
                    type: "string",
                    enum: ["load", "stride", "contact", "finish", "other"],
                  },
                  observation: { type: "string" },
                  isKeyFault: { type: "boolean" },
                  calloutLabel: { type: "string" },
                  region: {
                    type: "object",
                    additionalProperties: false,
                    properties: { x: { type: "number" }, y: { type: "number" } },
                    required: ["x", "y"],
                  },
                },
                required: [
                  "index",
                  "phase",
                  "observation",
                  "isKeyFault",
                  "calloutLabel",
                  "region",
                ],
              },
            },
            angleNote: { type: "string" },
            mechanics: { type: "string" },
            timing: { type: "string" },
            cues: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
            nextFocus: { type: "string" },
            drill: { type: "string" },
            metrics: {
              type: "object",
              additionalProperties: false,
              properties: {
                primaryFault: { type: "string" },
                faultCategory: { type: "string" },
                severity: { type: "number" },
                confidence: { type: "number" },
              },
              required: ["primaryFault", "faultCategory", "severity", "confidence"],
            },
          },
          required: [
            "frames",
            "angleNote",
            "mechanics",
            "timing",
            "cues",
            "nextFocus",
            "drill",
            "metrics",
          ],
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content ?? "";
  return VideoBreakdownSchema.parse(JSON.parse(content));
}
