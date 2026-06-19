import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTier } from "@/lib/tiers";

/**
 * Video access policy for the analyzer.
 *
 *   Pro, < cap this month      → video (capped per month — see below)
 *   Free account, < 2 lifetime  → free video (the TikTok hook)
 *   Free account, credits > 0   → spend a credit (bought via Stripe pack)
 *   Free account, none left     → blocked → upgrade / buy
 *   Pro at monthly cap          → blocked → resets next cycle
 *   Anonymous (no login)        → blocked → must create a free account
 *
 * Pro is intentionally NOT unlimited: a shared email/password can only burn
 * PRO_MONTHLY_VIDEO runs per rolling 30 days, which caps shared-account abuse
 * and bounds vision cost. Video is account-gated (no anonymous video) so the
 * 2 free are metered per user and we capture the lead. Counts come from
 * successful `kind='video'` rows in analyzer_usage.
 */

export const FREE_LIFETIME_VIDEO = 2;
export const PRO_MONTHLY_VIDEO = 20; // tweak to 15–25; anti shared-account abuse

export type VideoAccess =
  | { ok: true; mode: "pro" | "free" | "credit"; remaining: number }
  | {
      ok: false;
      reason: "anonymous" | "exhausted" | "pro_monthly_cap";
      used: number;
      credits: number;
    };

function rollingMonthStart(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

async function countVideo(userId: string, since?: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from("analyzer_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "video")
    .eq("status", 200);
  if (since) q = q.gte("created_at", since);
  const { count } = await q;
  return count ?? 0;
}

export async function checkVideoAccess(userId: string | null): Promise<VideoAccess> {
  if (!userId) {
    return { ok: false, reason: "anonymous", used: 0, credits: 0 };
  }

  const tier = await resolveTier(userId);

  if (tier === "pro") {
    const usedThisMonth = await countVideo(userId, rollingMonthStart());
    if (usedThisMonth < PRO_MONTHLY_VIDEO) {
      return { ok: true, mode: "pro", remaining: PRO_MONTHLY_VIDEO - usedThisMonth - 1 };
    }
    return { ok: false, reason: "pro_monthly_cap", used: usedThisMonth, credits: 0 };
  }

  // Free account: lifetime free, then purchased credits.
  const usedLifetime = await countVideo(userId);
  if (usedLifetime < FREE_LIFETIME_VIDEO) {
    return { ok: true, mode: "free", remaining: FREE_LIFETIME_VIDEO - usedLifetime - 1 };
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("analyzer_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const credits = (data?.balance as number | undefined) ?? 0;

  if (credits > 0) {
    return { ok: true, mode: "credit", remaining: 0 };
  }

  return { ok: false, reason: "exhausted", used: usedLifetime, credits: 0 };
}

/** Spend one credit (atomic, never below zero). Best-effort — never throws. */
export async function consumeCredit(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc("decrement_analyzer_credit", { p_user_id: userId });
  } catch (err) {
    console.error("[video-access] failed to consume credit:", err);
  }
}
