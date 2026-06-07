import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { BreakdownSession } from "@/lib/breakdown-format";
import type { BreakdownResult } from "@/lib/coaching-engine";

const PAGE = { w: 612, h: 792 };
const MARGIN = 54;
const NAVY = rgb(0.043, 0.122, 0.227);
const GOLD = rgb(0.957, 0.706, 0);
const TEXT = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.58, 0.64, 0.72);

function cap(v?: string) {
  if (!v) return "Not provided";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export async function buildBreakdownPdf(
  session: BreakdownSession,
  r: BreakdownResult
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - MARGIN;
  const maxW = PAGE.w - MARGIN * 2;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
    }
  };

  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const lines: string[] = [];
    for (const para of String(text).split("\n")) {
      const words = para.split(/\s+/);
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const para = (text: string, f: PDFFont, size: number, color = TEXT, gap = 4) => {
    for (const line of wrap(text, f, size)) {
      ensure(size + gap);
      page.drawText(line, { x: MARGIN, y, size, font: f, color });
      y -= size + gap;
    }
  };

  const heading = (text: string) => {
    y -= 12;
    ensure(16);
    page.drawText(text.toUpperCase(), { x: MARGIN, y, size: 10, font: bold, color: GOLD });
    y -= 16;
  };

  // Header band
  page.drawRectangle({ x: 0, y: PAGE.h - 96, width: PAGE.w, height: 96, color: NAVY });
  page.drawText("AI COACHING SOLUTIONS", { x: MARGIN, y: PAGE.h - 46, size: 10, font: bold, color: GOLD });
  page.drawText("Swing Breakdown", { x: MARGIN, y: PAGE.h - 70, size: 20, font: bold, color: rgb(1, 1, 1) });
  y = PAGE.h - 96 - 28;

  const meta = `${cap(session.sport)} · ${cap(session.motion)}` +
    (session.ageGroup ? ` · ${session.ageGroup}` : "") +
    (session.skillLevel ? ` · ${session.skillLevel}` : "");
  para(meta, font, 10, MUTED, 6);

  heading("What the coach is seeing");
  para(session.mainIssue, font, 11);

  heading("Mechanics — Root Cause");
  para(r.mechanics, font, 11);

  heading("Timing");
  para(r.timing, font, 11);

  heading("Coaching Cues");
  for (const c of r.cues) {
    para(`•  ${c}`, font, 11);
  }

  heading("Next Focus");
  para(r.nextFocus, font, 11);

  heading("Recommended Drill");
  para(r.drill, font, 11);

  y -= 16;
  ensure(24);
  para(
    "AI-assisted analysis from AI Coaching Solutions. A coaching tool — not a substitute for in-person coaching or medical advice.",
    font,
    8,
    MUTED,
    3
  );

  return doc.save();
}
