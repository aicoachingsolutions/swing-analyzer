import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveTier } from "@/lib/tiers";
import { checkVideoAccess, consumeCredit } from "@/lib/credits";
import { logUsage } from "@/lib/usage";
import {
  BREAKDOWN_SPORTS,
  BREAKDOWN_MOTIONS,
  hasInjection,
  runVisionBreakdown,
} from "@/lib/coaching-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const VideoRequestSchema = z.object({
  sport: z.enum(BREAKDOWN_SPORTS),
  motion: z.enum(BREAKDOWN_MOTIONS),
  handedness: z.enum(["left", "right"]).optional(),
  ageGroup: z.string().max(80).optional().default(""),
  skillLevel: z.string().max(60).optional().default(""),
  mainIssue: z.string().max(600).optional().default(""),
  // Data-URL frames extracted in the browser. Keep the count sane.
  images: z.array(z.string().startsWith("data:image/")).min(1).max(6),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // 1) Must be signed in for video.
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
  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to use video breakdown.", needsAuth: true },
      { status: 401 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Server misconfigured: missing OPENAI_API_KEY" }, { status: 500 });
  }

  // 2) Validate.
  const json = await req.json().catch(() => null);
  const parsed = VideoRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues?.[0]?.message || "Invalid request." },
      { status: 400 }
    );
  }
  if (parsed.data.mainIssue && hasInjection(parsed.data.mainIssue)) {
    return NextResponse.json(
      { error: "Your description contains unsupported content." },
      { status: 400 }
    );
  }

  // 3) Credits / Pro allowance.
  const tier = await resolveTier(userId);
  const access = await checkVideoAccess(userId, tier === "pro");
  if (!access.ok) {
    return NextResponse.json(
      {
        error:
          "You're out of video breakdowns. Buy a Swing Pack or go Pro for more.",
        outOfCredits: true,
      },
      { status: 402 }
    );
  }

  // 4) Run the vision breakdown on the frames.
  try {
    const { images, ...session } = parsed.data;
    const result = await runVisionBreakdown(session, images);

    await consumeCredit(userId, access.mode);
    await logUsage(userId, ip, "video", 200);

    return NextResponse.json({
      result,
      tier,
      remaining: access.remaining,
      mode: access.mode,
      isGolf: session.sport === "golf",
    });
  } catch (err) {
    await logUsage(userId, ip, "video", 500);
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
