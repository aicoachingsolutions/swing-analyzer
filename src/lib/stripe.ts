import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  cached = new Stripe(key);
  return cached;
}

/** Stripe price IDs (override via env; defaults are the live prices). */
export const PRICES = {
  pack: process.env.STRIPE_PRICE_SWING_PACK || "price_1TlKzZIGI93DDKQOF5o1tlZN",
  proMonth: process.env.STRIPE_PRICE_PRO_MONTH || "price_1TLOLeIGI93DDKQOwbikz6tt",
  proYear: process.env.STRIPE_PRICE_PRO_YEAR || "price_1TLOM2IGI93DDKQOhXwuxtV8",
};

/** Video breakdowns granted per Swing Pack purchase. */
export const SWING_PACK_CREDITS = 5;

export type CheckoutPlan = "pack" | "pro_month" | "pro_year";
