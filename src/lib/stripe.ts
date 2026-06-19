import Stripe from "stripe";

/** Server-only Stripe client. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Buyable products. Price IDs come from env (create the Prices in the Stripe
 * dashboard, then paste their IDs). Credit packs are one-time payments that top
 * up analyzer_credits; Pro is a subscription that sets plan_type='pro'.
 */
export type ProductId = "pack_small" | "pack_large" | "pro";

export type CreditPack = {
  id: Extract<ProductId, "pack_small" | "pack_large">;
  priceEnv: string;
  credits: number;
  label: string;
};

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack_small", priceEnv: "STRIPE_PRICE_PACK_SMALL", credits: 5, label: "5 video breakdowns" },
  { id: "pack_large", priceEnv: "STRIPE_PRICE_PACK_LARGE", credits: 15, label: "15 video breakdowns" },
];

export const PRO_PRICE_ENV = "STRIPE_PRICE_PRO";

/** Resolve the configured Stripe Price ID for a product, or null if unset. */
export function priceIdFor(product: ProductId): string | null {
  if (product === "pro") return process.env[PRO_PRICE_ENV] || null;
  const pack = CREDIT_PACKS.find((p) => p.id === product);
  return pack ? process.env[pack.priceEnv] || null : null;
}

export function packFor(product: ProductId): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.id === product) ?? null;
}
