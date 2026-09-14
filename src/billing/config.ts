/**
 * Billing env config.
 * MCP can run on break-glass API_KEYS alone; billing routes require Stripe + DATABASE_URL.
 */

export type CreditPack = "starter" | "standard" | "pro";

export const PACK_CREDITS_CENTS: Record<CreditPack, number> = {
  starter: 1000,
  standard: 2500,
  pro: 5000,
};

export const PACK_PRICE_ENV: Record<CreditPack, string> = {
  starter: "STRIPE_PRICE_CREDITS_10",
  standard: "STRIPE_PRICE_CREDITS_25",
  pro: "STRIPE_PRICE_CREDITS_50",
};

export function isCreditPack(value: unknown): value is CreditPack {
  return value === "starter" || value === "standard" || value === "pro";
}

/** True when Stripe secret is configured (billing features available). */
export function isBillingConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key);
}

export interface StripeBillingEnv {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  priceCredits10: string;
  priceCredits25: string;
  priceCredits50: string;
  publishableKey?: string;
  successUrl: string;
  cancelUrl: string;
  databaseUrl: string;
}

/**
 * Resolve Stripe + DB env for billing routes.
 * Throws a clear Error if any required var is missing.
 */
export function requireStripeBillingEnv(): StripeBillingEnv {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const priceCredits10 = process.env.STRIPE_PRICE_CREDITS_10?.trim() ?? "";
  const priceCredits25 = process.env.STRIPE_PRICE_CREDITS_25?.trim() ?? "";
  const priceCredits50 = process.env.STRIPE_PRICE_CREDITS_50?.trim() ?? "";
  const successUrl =
    process.env.BILLING_SUCCESS_URL?.trim() ??
    "http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    process.env.BILLING_CANCEL_URL?.trim() ??
    "http://localhost:3000/billing/cancel";
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || undefined;

  const missing: string[] = [];
  if (!stripeSecretKey) missing.push("STRIPE_SECRET_KEY");
  if (!stripeWebhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!priceCredits10) missing.push("STRIPE_PRICE_CREDITS_10");
  if (!priceCredits25) missing.push("STRIPE_PRICE_CREDITS_25");
  if (!priceCredits50) missing.push("STRIPE_PRICE_CREDITS_50");
  if (!databaseUrl) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    throw new Error(
      `Billing misconfigured; missing env: ${missing.join(", ")}. MCP may still run on API_KEYS alone.`,
    );
  }

  if (stripeSecretKey.startsWith("sk_live_")) {
    throw new Error(
      "Live Stripe keys are not enabled yet; use sk_test_ keys only until go-live approval.",
    );
  }

  return {
    stripeSecretKey,
    stripeWebhookSecret,
    priceCredits10,
    priceCredits25,
    priceCredits50,
    publishableKey,
    successUrl,
    cancelUrl,
    databaseUrl,
  };
}

/** Map pack name → Stripe price ID from env (no network). */
export function priceIdForPack(
  pack: CreditPack,
  env: Pick<
    StripeBillingEnv,
    "priceCredits10" | "priceCredits25" | "priceCredits50"
  > = {
    priceCredits10: process.env.STRIPE_PRICE_CREDITS_10?.trim() ?? "",
    priceCredits25: process.env.STRIPE_PRICE_CREDITS_25?.trim() ?? "",
    priceCredits50: process.env.STRIPE_PRICE_CREDITS_50?.trim() ?? "",
  },
): string {
  const map: Record<CreditPack, string> = {
    starter: env.priceCredits10,
    standard: env.priceCredits25,
    pro: env.priceCredits50,
  };
  const priceId = map[pack];
  if (!priceId) {
    throw new Error(`Missing price ID env for pack=${pack} (${PACK_PRICE_ENV[pack]})`);
  }
  return priceId;
}

export function parseSqlitePath(databaseUrl: string): string | null {
  const trimmed = databaseUrl.trim();
  if (trimmed === ":memory:" || trimmed === "file::memory:") {
    return null; // in-memory
  }
  if (trimmed.startsWith("file:")) {
    return trimmed.slice("file:".length);
  }
  return trimmed;
}
