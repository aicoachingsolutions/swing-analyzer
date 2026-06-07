import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** The three access levels for the analyzer. */
export type Tier = "anonymous" | "free" | "pro";

export type TierLimits = {
  /** Max analyses in the rolling window. */
  limit: number;
  /** Window the limit applies over. */
  window: "day" | "month";
  /** Whether video upload is allowed. */
  video: boolean;
  /** Whether results are saved to history. */
  history: boolean;
};

/**
 * Access policy per tier. Easy to tweak — change the numbers here.
 *   anonymous → a taste, capped per day by IP
 *   free      → more, capped per month by account
 *   pro       → video + the highest cap
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  anonymous: { limit: 2, window: "day", video: false, history: false },
  free: { limit: 5, window: "month", video: false, history: true },
  pro: { limit: 25, window: "month", video: true, history: true },
};

/** plan_type values (in `public.subscriptions`) that count as Pro. */
const PRO_PLAN_TYPES = ["paid", "pro", "trial"];

/**
 * Resolve a user's tier.
 *  - No userId            → anonymous
 *  - userId, no active Pro → free
 *  - userId + active Pro   → pro
 *
 * Reads `public.subscriptions` with the service-role client (bypasses RLS).
 */
export async function resolveTier(userId: string | null): Promise<Tier> {
  if (!userId) return "anonymous";

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("subscriptions")
      .select("plan_type, status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      data &&
      PRO_PLAN_TYPES.includes(String(data.plan_type)) &&
      String(data.status) === "active" &&
      (!data.current_period_end ||
        new Date(data.current_period_end as string).getTime() > Date.now())
    ) {
      return "pro";
    }
  } catch (err) {
    console.error("[tiers] failed to resolve subscription:", err);
  }

  return "free";
}
