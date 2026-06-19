import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Period end moved onto subscription items in recent Stripe API versions. */
function subPeriodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  const ts = item?.current_period_end;
  return typeof ts === "number" ? new Date(ts * 1000).toISOString() : null;
}

/**
 * Stripe webhook. Configure the endpoint in the Stripe dashboard to point at
 * /api/stripe-webhook and paste the signing secret into STRIPE_WEBHOOK_SECRET.
 *
 * - pack purchase (one-time)   → add_analyzer_credits(user, credits)
 * - Pro subscription started   → subscriptions.plan_type = 'pro'
 * - Pro subscription changed   → keep status + current_period_end in sync
 * - Pro subscription cancelled → plan_type = 'free'
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) break;

        if (session.mode === "payment") {
          // Credit pack
          const credits = parseInt(session.metadata?.credits || "0", 10);
          if (credits > 0) {
            await supabase.rpc("add_analyzer_credits", {
              p_user_id: userId,
              p_amount: credits,
            });
          }
        } else if (session.mode === "subscription") {
          // Pro started — pull period end from the subscription.
          let periodEnd: string | null = null;
          if (typeof session.subscription === "string") {
            const sub = await getStripe().subscriptions.retrieve(session.subscription);
            periodEnd = subPeriodEndIso(sub);
          }
          await supabase
            .from("subscriptions")
            .upsert(
              {
                user_id: userId,
                plan_type: "pro",
                status: "active",
                current_period_end: periodEnd,
              },
              { onConflict: "user_id" }
            );
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        const active = sub.status === "active" || sub.status === "trialing";
        await supabase
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan_type: active ? "pro" : "free",
              status: sub.status,
              current_period_end: subPeriodEndIso(sub),
            },
            { onConflict: "user_id" }
          );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (!userId) break;
        await supabase
          .from("subscriptions")
          .upsert(
            { user_id: userId, plan_type: "free", status: "canceled" },
            { onConflict: "user_id" }
          );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
