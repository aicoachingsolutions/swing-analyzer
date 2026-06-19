import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured, priceIdFor, packFor, type ProductId } from "@/lib/stripe";

export const runtime = "nodejs";

const VALID: ProductId[] = ["pack_small", "pack_large", "pro"];

export async function POST(req: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
    }

    // Must be logged in — we attach the purchase to the Supabase user.
    let userId: string | null = null;
    let email: string | undefined;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      email = user?.email ?? undefined;
    } catch {
      userId = null;
    }
    if (!userId) {
      return NextResponse.json(
        { error: "Please sign in first.", signup: true },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const product = body?.product as ProductId | undefined;
    if (!product || !VALID.includes(product)) {
      return NextResponse.json({ error: "Unknown product." }, { status: 400 });
    }

    const price = priceIdFor(product);
    if (!price) {
      return NextResponse.json(
        { error: "That product isn't set up yet." },
        { status: 503 }
      );
    }

    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const isPro = product === "pro";
    const pack = packFor(product);

    const session = await getStripe().checkout.sessions.create({
      mode: isPro ? "subscription" : "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      customer_email: email,
      // The webhook reads these back to know who/what to grant.
      metadata: {
        user_id: userId,
        product,
        credits: pack ? String(pack.credits) : "",
      },
      // Also stamp the user on the subscription so renewal/cancel events map back.
      ...(isPro ? { subscription_data: { metadata: { user_id: userId } } } : {}),
      success_url: `${site}/?purchase=success`,
      cancel_url: `${site}/?purchase=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Checkout failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
