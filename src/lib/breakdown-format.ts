import { z } from "zod";
import { BreakdownSchema, type BreakdownResult } from "@/lib/coaching-engine";

export type BreakdownSession = {
  sport: string;
  motion: string;
  ageGroup?: string;
  skillLevel?: string;
  mainIssue: string;
};

/** Shared payload schema for the email + PDF delivery routes. */
export const SessionSchema = z.object({
  sport: z.string().max(40),
  motion: z.string().max(40),
  ageGroup: z.string().max(80).optional().default(""),
  skillLevel: z.string().max(60).optional().default(""),
  mainIssue: z.string().min(1).max(600),
});

export const DeliveryRequestSchema = z.object({
  session: SessionSchema,
  result: BreakdownSchema,
});

function label(v?: string) {
  if (!v) return "Not provided";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** Plain-text version — used as the email text part and PDF source. */
export function breakdownToText(
  session: BreakdownSession,
  r: BreakdownResult
): string {
  return [
    "AI COACHING BREAKDOWN",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "SESSION",
    `Sport: ${label(session.sport)}`,
    `Motion: ${label(session.motion)}`,
    `Age group: ${session.ageGroup || "Not provided"}`,
    `Skill level: ${session.skillLevel || "Not provided"}`,
    "",
    "WHAT THE COACH IS SEEING",
    session.mainIssue,
    "",
    "MECHANICS — ROOT CAUSE",
    r.mechanics,
    "",
    "TIMING",
    r.timing,
    "",
    "COACHING CUES",
    ...r.cues.map((c) => `- ${c}`),
    "",
    "NEXT FOCUS",
    r.nextFocus,
    "",
    "RECOMMENDED DRILL",
    r.drill,
    "",
    "—",
    "AI Coaching Solutions · aicoachingsolutions.net",
    "AI-assisted analysis. A coaching tool, not a substitute for in-person coaching or medical advice.",
  ].join("\n");
}

/** Branded HTML version — used as the email HTML part. */
export function breakdownToHtml(
  session: BreakdownSession,
  r: BreakdownResult
): string {
  const cues = r.cues.map((c) => `<li>${esc(c)}</li>`).join("");
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0b1f3a;">
  <div style="background:#0b1f3a;color:#f8fafc;padding:24px;border-radius:12px 12px 0 0;">
    <div style="color:#f4b400;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">AI Coaching Solutions</div>
    <h1 style="margin:6px 0 0;font-size:22px;">Your Swing Breakdown</h1>
    <div style="color:#94a3b8;font-size:13px;margin-top:6px;">
      ${esc(label(session.sport))} · ${esc(label(session.motion))}
      ${session.ageGroup ? " · " + esc(session.ageGroup) : ""}
      ${session.skillLevel ? " · " + esc(session.skillLevel) : ""}
    </div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
    <p style="color:#475569;font-size:14px;"><strong>What you described:</strong> ${esc(session.mainIssue)}</p>
    ${block("Mechanics — Root Cause", r.mechanics)}
    ${block("Timing", r.timing)}
    <h2 style="color:#f4b400;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin:20px 0 6px;">Coaching Cues</h2>
    <ul style="margin:0;padding-left:20px;color:#1e293b;font-size:15px;">${cues}</ul>
    ${block("Next Focus", r.nextFocus)}
    ${block("Recommended Drill", r.drill)}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="color:#94a3b8;font-size:12px;">
      AI-assisted analysis from AI Coaching Solutions. A coaching tool — not a substitute for
      in-person coaching or medical advice.
    </p>
  </div>
</div>`.trim();
}

function block(title: string, body: string) {
  return `<h2 style="color:#f4b400;font-size:13px;letter-spacing:1px;text-transform:uppercase;margin:20px 0 6px;">${esc(
    title
  )}</h2><p style="color:#1e293b;font-size:15px;margin:0;">${esc(body)}</p>`;
}

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
