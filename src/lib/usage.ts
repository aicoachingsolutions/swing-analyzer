import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { TIER_LIMITS, type Tier } from "@/lib/tiers";

const TABLE = "analyzer_usage";

export type UsageCheck =
  | { ok: true; used: number; limit: number; remaining: number }
  | { ok: false; used: number; limit: number; window: "day" | "month" };

function windowStart(window: "day" | "month"): string {
  const now = new Date();
  if (window === "day") {
    return new Date(now.getTime() - 86_400_000).toISOString();
  }
  // rolling 30-day month
  return new Date(now.getTime() - 30 * 86_400_000).toISOString();
}

/**
 * Count usage in the tier's window and decide if another analysis is allowed.
 * Anonymous users are counted by IP; logged-in users by user_id.
 */
export async function checkUsage(
  tier: Tier,
  userId: string | null,
  ip: string
): Promise<UsageCheck> {
  const { limit, window } = TIER_LIMITS[tier];

  // Fail open in local/dev when Supabase isn't configured.
  if (!isSupabaseConfigured()) {
    console.warn("[usage] Supabase not configured — metering disabled.");
    return { ok: true, used: 0, limit, remaining: limit };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart(window));

  query = userId ? query.eq("user_id", userId) : query.eq("ip", ip);

  const { count } = await query;
  const used = count ?? 0;

  if (used >= limit) {
    return { ok: false, used, limit, window };
  }
  return { ok: true, used, limit, remaining: Math.max(0, limit - used - 1) };
}

/** Record one analysis. Never throws — logging must not break the request. */
export async function logUsage(
  userId: string | null,
  ip: string,
  kind: "text" | "video",
  status: number
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from(TABLE).insert({
      user_id: userId,
      ip,
      kind,
      status,
    });
  } catch (err) {
    console.error("[usage] failed to log:", err);
  }
}
