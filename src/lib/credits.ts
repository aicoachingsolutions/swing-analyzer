import { getSupabaseAdmin } from "@/lib/supabase/admin";

const FREE_VIDEO_GRANT = 2;
const PRO_MONTHLY_VIDEO = 20;

export type VideoAccess =
  | { ok: true; mode: "pro"; remaining: number }
  | { ok: true; mode: "credits"; remaining: number }
  | { ok: false; reason: "out"; balance: number };

/** Ensure a new account has its one-time free video grant, then return balance. */
async function ensureCredits(userId: string): Promise<{ balance: number }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("analyzer_credits")
    .select("balance, free_granted")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabase.from("analyzer_credits").insert({
      user_id: userId,
      balance: FREE_VIDEO_GRANT,
      free_granted: true,
    });
    return { balance: FREE_VIDEO_GRANT };
  }

  if (!data.free_granted) {
    const balance = (data.balance ?? 0) + FREE_VIDEO_GRANT;
    await supabase
      .from("analyzer_credits")
      .update({ balance, free_granted: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { balance };
  }

  return { balance: data.balance ?? 0 };
}

async function proVideoCountThisMonth(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count } = await supabase
    .from("analyzer_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "video")
    .gte("created_at", since);
  return count ?? 0;
}

/** Decide whether this user can run a video breakdown, without consuming yet. */
export async function checkVideoAccess(
  userId: string,
  isPro: boolean
): Promise<VideoAccess> {
  if (isPro) {
    const used = await proVideoCountThisMonth(userId);
    if (used >= PRO_MONTHLY_VIDEO) {
      return { ok: false, reason: "out", balance: 0 };
    }
    return { ok: true, mode: "pro", remaining: PRO_MONTHLY_VIDEO - used - 1 };
  }

  const { balance } = await ensureCredits(userId);
  if (balance <= 0) {
    return { ok: false, reason: "out", balance: 0 };
  }
  return { ok: true, mode: "credits", remaining: balance - 1 };
}

/** Consume one credit (no-op for Pro — they're metered by monthly count). */
export async function consumeCredit(userId: string, mode: "pro" | "credits"): Promise<void> {
  if (mode === "pro") return;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("analyzer_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const next = Math.max(0, (data?.balance ?? 0) - 1);
  await supabase
    .from("analyzer_credits")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/** Add credits (used by the Stripe swing-pack webhook, later). */
export async function addCredits(userId: string, amount: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("analyzer_credits")
    .select("balance, free_granted")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabase
      .from("analyzer_credits")
      .insert({ user_id: userId, balance: amount, free_granted: true });
    return;
  }
  await supabase
    .from("analyzer_credits")
    .update({ balance: (data.balance ?? 0) + amount, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}
