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
