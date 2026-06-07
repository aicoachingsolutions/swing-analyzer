import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DeliveryRequestSchema } from "@/lib/breakdown-format";
import { captureLead, emailRateLimitOk, sendBreakdownEmail } from "@/lib/email";

export const runtime = "nodejs";

const EmailRequestSchema = DeliveryRequestSchema.extend({
  email: z.string().email("Please enter a valid email address."),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const json = await req.json().catch(() => null);
  const parsed = EmailRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues?.[0]?.message || "Invalid request." },
      { status: 400 }
    );
  }

  const { email, session, result } = parsed.data;

  if (!(await emailRateLimitOk(ip))) {
    return NextResponse.json(
      { error: "Too many emails from this connection. Try again later." },
      { status: 429 }
    );
  }

  // Capture the lead first — even if email delivery hiccups, we keep the contact.
  await captureLead(email, userId, ip, session);

  try {
    await sendBreakdownEmail(email, session, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
