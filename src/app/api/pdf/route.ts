import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tiers";
import { DeliveryRequestSchema } from "@/lib/breakdown-format";
import { buildBreakdownPdf } from "@/lib/pdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // PDF download is a Pro perk — gate on the server so it can't be bypassed.
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

  const tier = await resolveTier(userId);
  if (tier !== "pro") {
    return NextResponse.json(
      { error: "PDF download is a Pro feature.", upgrade: true },
      { status: 403 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = DeliveryRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues?.[0]?.message || "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const bytes = await buildBreakdownPdf(parsed.data.session, parsed.data.result);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="swing-breakdown.pdf"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to build PDF.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
