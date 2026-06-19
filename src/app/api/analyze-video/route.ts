import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  VideoBreakdownRequestSchema,
  hasInjection,
  runVideoBreakdown,
} from "@/lib/coaching-engine";
import { checkVideoAccess, consumeCredit } from "@/lib/video-access";
import { logUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // 1) Who is this? Video is account-gated.
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

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured: missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // 2) Can they run a video breakdown?
    const access = await checkVideoAccess(userId);
    if (!access.ok) {
      if (access.reason === "anonymous") {
        return NextResponse.json(
          {
            error: "Create a free account to analyze video — your first 2 are on us.",
            signup: true,
          },
          { status: 401 }
        );
      }
      await logUsage(userId, ip, "video", 402);
      return NextResponse.json(
        {
          error: "You've used your 2 free video breakdowns. Buy a pack or go Pro for unlimited.",
          upgrade: true,
        },
        { status: 402 }
      );
    }

    // 3) Validate input (frames are the primary signal).
    const json = await req.json().catch(() => null);
    const parsed = VideoBreakdownRequestSchema.safeParse(json);
    if (!parsed.success) {
      await logUsage(userId, ip, "video", 400);
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message || "Invalid request." },
        { status: 400 }
      );
    }

    if (parsed.data.mainIssue && hasInjection(parsed.data.mainIssue)) {
      await logUsage(userId, ip, "video", 400);
      return NextResponse.json(
        { error: "Your note contains unsupported content. Describe it in coaching terms." },
        { status: 400 }
      );
    }

    // 4) Run the vision engine.
    const result = await runVideoBreakdown(parsed.data);

    // 5) Record the successful run, then spend a credit if that's the mode used.
    await logUsage(userId, ip, "video", 200);
    if (access.mode === "credit" && userId) {
      await consumeCredit(userId);
    }

    return NextResponse.json(
      { result, mode: access.mode, freeRemaining: access.freeRemaining },
      { headers: { "X-Analyzer-Video-Mode": access.mode } }
    );
  } catch (err: unknown) {
    await logUsage(userId, ip, "video", 500);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
