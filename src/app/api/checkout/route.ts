import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, PRICES, SWING_PACK_CREDITS, type CheckoutPlan } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in first.", needsAuth: true }, { status: 401 });
  }

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: CheckoutPlan };
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const stripe = getStripe();

  const common = {
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url: `${origin}/video?checkout=success`,
    cancel_url: `${origin}/video?checkout=cancel`,
  };

  try {
    let url: string | null = null;

    if (plan === "pack") {
      const session = await stripe.checkout.sessions.create({
        ...common,
        mode: "payment",
        line_items: [{ price: PRICES.pack, quantity: 1 }],
        metadata: { user_id: user.id, kind: "pack", credits: String(SWING_PACK_CREDITS) },
        payment_intent_data: {
          metadata: { user_id: user.id, kind: "pack", credits: String(SWING_PACK_CREDITS) },
        },
      });
      url = session.url;
    } else if (plan === "pro_month" || plan === "pro_year") {
      const session = await stripe.checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ price: plan === "pro_month" ? PRICES.proMonth : PRICES.proYear, quantity: 1 }],
        metadata: { user_id: user.id, kind: "pro" },
        subscription_data: { metadata: { user_id: user.id, kind: "pro" } },
      });
      url = session.url;
    } else {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
