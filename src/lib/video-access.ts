import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTier } from "@/lib/tiers";

/**
 * Video access policy for the analyzer.
 *
 *   Pro                         → unlimited video
 *   Free account, < 2 lifetime  → free video (the TikTok hook)
 *   Free account, credits > 0   → spend a credit (bought via Stripe pack)
 *   Free account, none left     → blocked → upgrade / buy
 *   Anonymous (no login)        → blocked → must create a free account
 *
 * Video is account-gated (no anonymous video) so the 2 free are metered per
 * user and we capture the lead. Lifetime free count = successful `kind='video'`
 * rows in analyzer_usage.
 */

export const FREE_LIFETIME_VIDEO = 2;

export type VideoAccess =
  | { ok: true; mode: "pro" | "free" | "credit"; freeRemaining: number }
  | { ok: false; reason: "anonymous" | "exhausted"; freeUsed: number; credits: number };

export async function checkVideoAccess(userId: string | null): Promise<VideoAccess> {
  if (!userId) {
    return { ok: false, reason: "anonymous", freeUsed: 0, credits: 0 };
  }

  const tier = await resolveTier(userId);
  if (tier === "pro") {
    return { ok: true, mode: "pro", freeRemaining: Number.MAX_SAFE_INTEGER };
  }

  const supabase = getSupabaseAdmin();

  // Lifetime successful video analyses for this account.
  const { count } = await supabase
    .from("analyzer_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "video")
    .eq("status", 200);
  const used = count ?? 0;

  if (used < FREE_LIFETIME_VIDEO) {
    return { ok: true, mode: "free", freeRemaining: FREE_LIFETIME_VIDEO - used - 1 };
  }

  // Out of free video → check purchased credits.
  const { data } = await supabase
    .from("analyzer_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const credits = (data?.balance as number | undefined) ?? 0;

  if (credits > 0) {
    return { ok: true, mode: "credit", freeRemaining: 0 };
  }

  return { ok: false, reason: "exhausted", freeUsed: used, credits: 0 };
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
