import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveTier, TIER_LIMITS } from "@/lib/tiers";
import { checkUsage, logUsage } from "@/lib/usage";
import {
  BreakdownRequestSchema,
  hasInjection,
  runBreakdown,
} from "@/lib/coaching-engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // 1) Who is this? (anonymous if no Supabase session)
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

  // 2) What can they do?
  const tier = await resolveTier(userId);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Server misconfigured: missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // 3) Are they within their limit?
    const usage = await checkUsage(tier, userId, ip);
    if (!usage.ok) {
      await logUsage(userId, ip, "text", 429);
      const msg =
        tier === "anonymous"
          ? "You've used your free analyses for today. Sign up free for more."
          : tier === "free"
            ? "You've reached this month's free limit. Upgrade to Pro for more."
            : "You've reached this month's limit.";
      return NextResponse.json(
        { error: msg, tier, upgrade: tier !== "pro" },
        { status: 429 }
      );
    }

    // 4) Validate input
    const json = await req.json().catch(() => null);
    const parsed = BreakdownRequestSchema.safeParse(json);
    if (!parsed.success) {
      await logUsage(userId, ip, "text", 400);
      return NextResponse.json(
        { error: parsed.error.issues?.[0]?.message || "Invalid request." },
        { status: 400 }
      );
    }

    if (hasInjection(parsed.data.mainIssue)) {
      await logUsage(userId, ip, "text", 400);
      return NextResponse.json(
        {
          error:
            "Your description contains unsupported content. Please describe what you're observing in coaching terms.",
        },
        { status: 400 }
      );
    }

    // 5) Run the coaching engine
    const result = await runBreakdown(parsed.data);
    await logUsage(userId, ip, "text", 200);

    return NextResponse.json(
      {
        result,
        tier,
        remaining: usage.remaining,
        // TODO (Phase 2): if tier === "pro" and an athlete is selected, write
        // result.metrics into team_stat_reports/team_stat_values.
      },
      {
        headers: { "X-Analyzer-Tier": tier },
      }
    );
  } catch (err: unknown) {
    await logUsage(userId, ip, "text", 500);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
