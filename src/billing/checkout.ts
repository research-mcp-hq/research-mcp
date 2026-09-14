import Stripe from "stripe";
import {
  isCreditPack,
  PACK_CREDITS_CENTS,
  priceIdForPack,
  requireStripeBillingEnv,
  type CreditPack,
  type StripeBillingEnv,
} from "./config.js";

export { isCreditPack, priceIdForPack, PACK_CREDITS_CENTS };
export type { CreditPack };

export interface CreateCheckoutInput {
  pack: CreditPack;
  /** Optional existing Stripe customer id */
  stripeCustomerId?: string;
  /** Optional our customer uuid for metadata */
  ourCustomerId?: string;
}

export interface CreateCheckoutResult {
  url: string;
  sessionId: string;
}

/** Pure mapper for unit tests (no Stripe network). */
export function mapPackToCheckoutParams(
  pack: CreditPack,
  env: Pick<
    StripeBillingEnv,
    | "priceCredits10"
    | "priceCredits25"
    | "priceCredits50"
    | "successUrl"
    | "cancelUrl"
  >,
  ourCustomerId?: string,
): {
  priceId: string;
  creditsCents: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
} {
  return {
    priceId: priceIdForPack(pack, env),
    creditsCents: PACK_CREDITS_CENTS[pack],
    successUrl: env.successUrl,
    cancelUrl: env.cancelUrl,
    metadata: buildCheckoutMetadata(pack, ourCustomerId),
  };
}

export function buildCheckoutMetadata(
  pack: CreditPack,
  ourCustomerId?: string,
): Record<string, string> {
  const meta: Record<string, string> = {
    pack,
    credits_usd_cents: String(PACK_CREDITS_CENTS[pack]),
    product: "research_mcp",
  };
  if (ourCustomerId) meta.our_customer_id = ourCustomerId;
  return meta;
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
  deps?: {
    stripe?: Stripe;
    env?: StripeBillingEnv;
  },
): Promise<CreateCheckoutResult> {
  const env = deps?.env ?? requireStripeBillingEnv();
  const stripe = deps?.stripe ?? new Stripe(env.stripeSecretKey);

  const priceId = priceIdForPack(input.pack, env);
  const metadata = buildCheckoutMetadata(input.pack, input.ourCustomerId);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: env.successUrl,
    cancel_url: env.cancelUrl,
    metadata,
    payment_intent_data: {
      metadata,
    },
  };

  if (input.stripeCustomerId) {
    sessionParams.customer = input.stripeCustomerId;
  } else {
    sessionParams.customer_creation = "always";
  }

  if (input.ourCustomerId) {
    sessionParams.client_reference_id = input.ourCustomerId;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) {
    throw new Error("Stripe Checkout Session missing url");
  }
  return { url: session.url, sessionId: session.id };
}
