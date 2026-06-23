import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";

export const runtime = "nodejs";

async function setSubscription(
  userId: string,
  args: { status: string; currentPeriodEnd: string | null; customerId: string | null; subscriptionId: string | null }
) {
  const supabase = getSupabaseAdmin();
  const active = args.status === "active" || args.status === "trialing";

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_type: active ? "paid" : "free",
      status: args.status,
      current_period_end: args.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  await supabase.from("analyzer_billing").upsert(
    {
      user_id: userId,
      stripe_customer_id: args.customerId,
      stripe_subscription_id: args.subscriptionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("analyzer_billing")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id || s.metadata?.user_id;
        if (!userId) break;

        if (s.mode === "payment" && s.metadata?.kind === "pack") {
          await addCredits(userId, parseInt(s.metadata?.credits || "5", 10));
        } else if (s.mode === "subscription") {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id ?? null;
          const custId = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
          let periodEnd: string | null = null;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }
          await setSubscription(userId, {
            status: "active",
            currentPeriodEnd: periodEnd,
            customerId: custId,
            subscriptionId: subId,
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const userId = sub.metadata?.user_id || (await userIdFromCustomer(customerId));
        if (!userId) break;

        const canceled = event.type === "customer.subscription.deleted";
        await setSubscription(userId, {
          status: canceled ? "canceled" : sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
          customerId,
          subscriptionId: sub.id,
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Handler error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
