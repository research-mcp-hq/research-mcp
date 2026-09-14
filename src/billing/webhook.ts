import type { Request, Response } from "express";
import Stripe from "stripe";
import type { CreditPack } from "./config.js";
import { isCreditPack, PACK_CREDITS_CENTS, requireStripeBillingEnv } from "./config.js";
import type { LedgerDb } from "./db.js";
import { ensureCustomerApiKey } from "./keys.js";
import { grantPackCredits, upsertCustomer } from "./ledger.js";
import { stashReveal } from "./reveal-store.js";

export interface StripeWebhookDeps {
  db: LedgerDb;
  stripe?: Stripe;
  webhookSecret?: string;
  /** Inject constructEvent for tests (no live Stripe). */
  constructEvent?: (
    payload: string | Buffer,
    signature: string,
    secret: string,
  ) => Stripe.Event;
}

function resolveCreditsCents(session: Stripe.Checkout.Session): number {
  const raw = session.metadata?.credits_usd_cents;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  const pack = session.metadata?.pack;
  if (isCreditPack(pack)) return PACK_CREDITS_CENTS[pack];
  return 0;
}

function resolvePack(session: Stripe.Checkout.Session): CreditPack | string {
  const pack = session.metadata?.pack;
  return isCreditPack(pack) ? pack : pack ?? "unknown";
}

/**
 * Fulfill a paid Checkout Session: credit ledger + ensure API key.
 * Idempotent on event id + session id.
 */
export function fulfillCheckoutSession(
  db: LedgerDb,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): {
  ok: boolean;
  reason?: string;
  customerId?: string;
  creditsCents?: number;
} {
  if (session.payment_status !== "paid") {
    return { ok: false, reason: `payment_status=${session.payment_status}` };
  }

  const creditsCents = resolveCreditsCents(session);
  if (creditsCents <= 0) {
    return { ok: false, reason: "missing_credits_metadata" };
  }

  const email =
    session.customer_details?.email ??
    session.customer_email ??
    undefined;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const ourId = session.metadata?.our_customer_id || undefined;

  const customerId = upsertCustomer(db, {
    id: ourId,
    stripeCustomerId,
    email: email ?? null,
  });

  const grant = grantPackCredits(db, {
    customerId,
    creditsCents,
    stripeEventId: event.id,
    checkoutSessionId: session.id,
  });

  const keyResult = ensureCustomerApiKey(db, customerId);

  stashReveal(session.id, {
    plaintextKey: keyResult.plaintext,
    creditsCents: grant.creditsCents,
    pack: String(resolvePack(session)),
    customerId,
    keyPrefix: keyResult.keyPrefix,
    keyReused: !keyResult.created,
  });

  return {
    ok: true,
    customerId,
    creditsCents: grant.creditsCents,
    reason: grant.alreadyGranted ? "already_granted" : "granted",
  };
}

export function handleStripeWebhook(
  req: Request,
  res: Response,
  deps: StripeWebhookDeps,
): void {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).json({ error: "missing_signature" });
    return;
  }

  let webhookSecret = deps.webhookSecret;
  let stripe = deps.stripe;
  if (!webhookSecret || !stripe) {
    try {
      const env = requireStripeBillingEnv();
      webhookSecret = webhookSecret ?? env.stripeWebhookSecret;
      stripe = stripe ?? new Stripe(env.stripeSecretKey);
    } catch (err) {
      res.status(500).json({
        error: "billing_misconfigured",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }

  const rawBody = req.body;
  // express.raw → Buffer; reject if already parsed as object
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") {
    res.status(400).json({
      error: "invalid_body",
      message: "Webhook requires raw body for signature verification",
    });
    return;
  }

  let event: Stripe.Event;
  try {
    const construct =
      deps.constructEvent ??
      ((payload, sig, secret) => stripe!.webhooks.constructEvent(payload, sig, secret));
    event = construct(rawBody, signature, webhookSecret);
  } catch {
    res.status(400).json({ error: "invalid_signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = fulfillCheckoutSession(deps.db, event, session);
        process.stdout.write(
          JSON.stringify({
            type: "stripe_webhook",
            eventType: event.type,
            eventId: event.id,
            sessionId: session.id,
            ...result,
          }) + "\n",
        );
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        process.stdout.write(
          JSON.stringify({
            type: "stripe_webhook",
            eventType: event.type,
            eventId: event.id,
            sessionId: session.id,
            ok: false,
            reason: "async_payment_failed",
          }) + "\n",
        );
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        process.stdout.write(
          JSON.stringify({
            type: "stripe_webhook",
            eventType: event.type,
            eventId: event.id,
            sessionId: session.id,
            ok: true,
            reason: "expired_noop",
          }) + "\n",
        );
        break;
      }
      default:
        // Ignore payment_intent.succeeded and others — Session is sole fulfill source
        process.stdout.write(
          JSON.stringify({
            type: "stripe_webhook",
            eventType: event.type,
            eventId: event.id,
            ok: true,
            reason: "ignored",
          }) + "\n",
        );
    }
    res.status(200).json({ received: true });
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        type: "stripe_webhook_error",
        message: err instanceof Error ? err.message : String(err),
      }) + "\n",
    );
    res.status(500).json({ error: "fulfill_failed" });
  }
}
