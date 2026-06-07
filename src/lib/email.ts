import nodemailer from "nodemailer";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  breakdownToHtml,
  breakdownToText,
  type BreakdownSession,
} from "@/lib/breakdown-format";
import type { BreakdownResult } from "@/lib/coaching-engine";

const LEADS_TABLE = "analyzer_leads";
const EMAIL_PER_IP_PER_HOUR = 10;

/** Light anti-abuse: cap how many emails one IP can trigger per hour. */
export async function emailRateLimitOk(ip: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await supabase
      .from(LEADS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    return (count ?? 0) < EMAIL_PER_IP_PER_HOUR;
  } catch {
    return true; // fail open
  }
}

/** Save the captured email + context — this is the marketing list. */
export async function captureLead(
  email: string,
  userId: string | null,
  ip: string,
  session: BreakdownSession
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from(LEADS_TABLE).insert({
      email,
      user_id: userId,
      ip,
      sport: session.sport,
      motion: session.motion,
      main_issue: session.mainIssue.slice(0, 600),
    });
  } catch (err) {
    console.error("[email] failed to capture lead:", err);
  }
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Email not configured: set SMTP_HOST, SMTP_USER, and SMTP_PASS."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user, pass },
  });
}

export async function sendBreakdownEmail(
  to: string,
  session: BreakdownSession,
  result: BreakdownResult
): Promise<void> {
  // Many hosts (incl. SiteGround) require the From to be the authenticated mailbox.
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER!;

  await getTransport().sendMail({
    from,
    to,
    subject: `Your ${session.sport} ${session.motion} breakdown`,
    html: breakdownToHtml(session, result),
    text: breakdownToText(session, result),
  });
}
