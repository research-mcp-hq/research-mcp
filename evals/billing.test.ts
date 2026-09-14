/**
 * Billing invariant tests — no live Stripe calls.
 * Run: npm run test:billing
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { setLedgerDbForTests, LedgerDb } from "../src/billing/db.js";
import {
  assertSufficientCredits,
  centsForSku,
  debitIfBillable,
  getBalanceCents,
  grantPackCredits,
  InsufficientCreditsError,
  upsertCustomer,
} from "../src/billing/ledger.js";
import { ensureCustomerApiKey, hashApiKey } from "../src/billing/keys.js";
import { mapPackToCheckoutParams, priceIdForPack } from "../src/billing/checkout.js";
import { clearRevealStoreForTests, peekReveal } from "../src/billing/reveal-store.js";
import { fulfillCheckoutSession, handleStripeWebhook } from "../src/billing/webhook.js";
import { applyChargeGate } from "../src/usage.js";
import { resolveAuth } from "../src/auth.js";
import { sendInsufficientCredits } from "../src/billing/http402.js";

function mockRes() {
  const state: {
    statusCode: number;
    body: unknown;
  } = { statusCode: 200, body: null };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function fakeCheckoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: overrides.id ?? `cs_test_${randomUUID()}`,
    object: "checkout.session",
    payment_status: overrides.payment_status ?? "paid",
    customer: overrides.customer ?? `cus_test_${randomUUID()}`,
    customer_email: overrides.customer_email ?? "buyer@example.com",
    customer_details: overrides.customer_details ?? {
      email: "buyer@example.com",
    },
    metadata: overrides.metadata ?? {
      pack: "starter",
      credits_usd_cents: "1000",
      product: "research_mcp",
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

function fakeEvent(
  type: string,
  session: Stripe.Checkout.Session,
  id?: string,
): Stripe.Event {
  return {
    id: id ?? `evt_test_${randomUUID()}`,
    object: "event",
    type,
    data: { object: session },
  } as Stripe.Event;
}

async function withDb(fn: (db: LedgerDb) => void | Promise<void>): Promise<void> {
  const db = await LedgerDb.openMemory();
  setLedgerDbForTests(db);
  clearRevealStoreForTests();
  try {
    await fn(db);
  } finally {
    setLedgerDbForTests(null);
    clearRevealStoreForTests();
    db.close();
  }
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`FAIL - ${name}\n`);
    process.stdout.write(`  ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  }
}

await test("pack mapper maps starter/standard/pro to price env (no Stripe)", () => {
  const env = {
    priceCredits10: "price_test_10",
    priceCredits25: "price_test_25",
    priceCredits50: "price_test_50",
    successUrl: "http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "http://localhost:3000/billing/cancel",
  };
  assert.equal(priceIdForPack("starter", env), "price_test_10");
  assert.equal(priceIdForPack("standard", env), "price_test_25");
  assert.equal(priceIdForPack("pro", env), "price_test_50");
  const mapped = mapPackToCheckoutParams("standard", env);
  assert.equal(mapped.creditsCents, 2500);
  assert.equal(mapped.metadata.pack, "standard");
  assert.equal(mapped.priceId, "price_test_25");
});

await test("webhook idempotency — duplicate event id → single grant", async () => {
  await withDb(async (db) => {
    const session = fakeCheckoutSession();
    const event = fakeEvent("checkout.session.completed", session, "evt_dup_1");

    const r1 = fulfillCheckoutSession(db, event, session);
    const r2 = fulfillCheckoutSession(db, event, session);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r2.reason, "already_granted");

    const balance = getBalanceCents(db, r1.customerId!);
    assert.equal(balance, 1000);

    const rows = db.all<{ delta_cents: number }>(
      `SELECT delta_cents FROM ledger_entries WHERE reason = 'pack_purchase'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.delta_cents, 1000);
  });
});

await test("webhook idempotency — same session different event → single grant", async () => {
  await withDb(async (db) => {
    const session = fakeCheckoutSession({ id: "cs_same_session" });
    const e1 = fakeEvent("checkout.session.completed", session, "evt_a");
    const e2 = fakeEvent("checkout.session.async_payment_succeeded", session, "evt_b");
    fulfillCheckoutSession(db, e1, session);
    fulfillCheckoutSession(db, e2, session);
    const rows = db.all(`SELECT id FROM ledger_entries WHERE reason = 'pack_purchase'`);
    assert.equal(rows.length, 1);
  });
});

await test("unpaid session → no credit", async () => {
  await withDb(async (db) => {
    const session = fakeCheckoutSession({ payment_status: "unpaid" });
    const event = fakeEvent("checkout.session.completed", session);
    const r = fulfillCheckoutSession(db, event, session);
    assert.equal(r.ok, false);
    const rows = db.all(`SELECT id FROM ledger_entries`);
    assert.equal(rows.length, 0);
  });
});

await test("bad signature → 400, no DB write", async () => {
  await withDb(async (db) => {
    const { res, state } = mockRes();
    const req = {
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: Buffer.from(JSON.stringify({ id: "evt_x" })),
    } as unknown as Request;

    handleStripeWebhook(req, res, {
      db,
      webhookSecret: "whsec_test",
      stripe: {} as Stripe,
      constructEvent: () => {
        throw new Error("bad sig");
      },
    });

    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { error: string }).error, "invalid_signature");
    assert.equal(db.all(`SELECT id FROM ledger_entries`).length, 0);
  });
});

await test("valid mocked webhook credits + issues key", async () => {
  await withDb(async (db) => {
    const session = fakeCheckoutSession();
    const event = fakeEvent("checkout.session.completed", session);
    const { res, state } = mockRes();
    const req = {
      headers: { "stripe-signature": "t=1,v1=ok" },
      body: Buffer.from("{}"),
    } as unknown as Request;

    handleStripeWebhook(req, res, {
      db,
      webhookSecret: "whsec_test",
      stripe: {} as Stripe,
      constructEvent: () => event,
    });

    assert.equal(state.statusCode, 200);
    const reveal = peekReveal(session.id);
    assert.ok(reveal);
    assert.equal(reveal!.creditsCents, 1000);
    assert.ok(reveal!.plaintextKey?.startsWith("rmcp_"));
  });
});

await test("debit billable call decrements exact cents (lite 25)", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "a@b.c" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 1000,
      stripeEventId: "evt_credit",
      checkoutSessionId: "cs_credit",
    });
    assert.equal(centsForSku("lite"), 25);
    const result = debitIfBillable(db, {
      customerId,
      billable: true,
      chargeUsd: 0.25,
      usageRequestId: "req_1",
      tool: "source_lookup",
    });
    assert.equal(result.debited, true);
    assert.equal(result.deltaCents, -25);
    assert.equal(result.balanceCents, 975);
    assert.equal(getBalanceCents(db, customerId), 975);
  });
});

await test("debit standard 60 and deep 150", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "c@d.e" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 1000,
      stripeEventId: "evt_c2",
      checkoutSessionId: "cs_c2",
    });
    debitIfBillable(db, {
      customerId,
      billable: true,
      chargeUsd: 0.6,
      usageRequestId: "req_s",
      tool: "compare_options",
    });
    assert.equal(getBalanceCents(db, customerId), 940);
    debitIfBillable(db, {
      customerId,
      billable: true,
      chargeUsd: 1.5,
      usageRequestId: "req_d",
      tool: "research_brief",
      depth: "deep",
    });
    assert.equal(getBalanceCents(db, customerId), 790);
  });
});

await test("insufficient balance → error; balance unchanged / non-negative", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "e@f.g" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 20,
      stripeEventId: "evt_low",
      checkoutSessionId: "cs_low",
    });
    assert.throws(
      () =>
        debitIfBillable(db, {
          customerId,
          billable: true,
          chargeUsd: 0.25,
          usageRequestId: "req_fail",
          tool: "source_lookup",
        }),
      (err: unknown) => err instanceof InsufficientCreditsError,
    );
    assert.equal(getBalanceCents(db, customerId), 20);
  });
});

await test("HTTP 402 helper returns insufficient_credits", () => {
  const { res, state } = mockRes();
  sendInsufficientCredits(res, new InsufficientCreditsError(10, 25));
  assert.equal(state.statusCode, 402);
  assert.equal((state.body as { error: string }).error, "insufficient_credits");
});

await test("non-billable / quality-fail → no debit", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "h@i.j" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 500,
      stripeEventId: "evt_nb",
      checkoutSessionId: "cs_nb",
    });
    const gate = applyChargeGate("research_brief", "deep", {
      mode: "sample",
      billable: false,
    });
    assert.equal(gate.billable, false);
    assert.equal(gate.charge_usd, 0);
    const result = debitIfBillable(db, {
      customerId,
      billable: gate.billable,
      chargeUsd: gate.charge_usd,
      usageRequestId: "req_nb",
      tool: "research_brief",
      depth: "deep",
    });
    assert.equal(result.debited, false);
    assert.equal(getBalanceCents(db, customerId), 500);
  });
});

await test("repurchase reuses active key (no spam keys)", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, {
      stripeCustomerId: "cus_reuse",
      email: "reuse@example.com",
    });
    const k1 = ensureCustomerApiKey(db, customerId);
    assert.equal(k1.created, true);
    assert.ok(k1.plaintext);
    const k2 = ensureCustomerApiKey(db, customerId);
    assert.equal(k2.created, false);
    assert.equal(k2.plaintext, null);
    const keys = db.all(`SELECT key_hash FROM api_keys WHERE customer_id = ?`, [
      customerId,
    ]);
    assert.equal(keys.length, 1);
  });
});

await test("dual auth: break-glass env key + customer hash key", async () => {
  await withDb(async (db) => {
    const prev = process.env.API_KEYS;
    process.env.API_KEYS = "break-glass-secret";
    try {
      const bg = resolveAuth("break-glass-secret");
      assert.ok(bg);
      assert.equal(bg!.breakGlass, true);

      const customerId = upsertCustomer(db, { email: "auth@test" });
      const { plaintext } = ensureCustomerApiKey(db, customerId);
      assert.ok(plaintext);
      const cust = resolveAuth(plaintext!);
      assert.ok(cust);
      assert.equal(cust!.breakGlass, false);
      assert.equal(cust!.customerId, customerId);

      assert.equal(resolveAuth("nope"), null);

      // revoked
      db.run(`UPDATE api_keys SET status = 'revoked' WHERE key_hash = ?`, [
        hashApiKey(plaintext!),
      ]);
      assert.equal(resolveAuth(plaintext!), null);
    } finally {
      if (prev === undefined) delete process.env.API_KEYS;
      else process.env.API_KEYS = prev;
    }
  });
});

await test("payment_intent.succeeded is ignored by webhook handler (no fulfill)", async () => {
  await withDb(async (db) => {
    const piEvent = {
      id: "evt_pi",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_x" } },
    } as Stripe.Event;
    const { res, state } = mockRes();
    handleStripeWebhook(
      {
        headers: { "stripe-signature": "ok" },
        body: Buffer.from("{}"),
      } as unknown as Request,
      res,
      {
        db,
        webhookSecret: "whsec",
        stripe: {} as Stripe,
        constructEvent: () => piEvent,
      },
    );
    assert.equal(state.statusCode, 200);
    assert.equal(db.all(`SELECT id FROM ledger_entries`).length, 0);
  });
});


await test("golden depth mismatch → charge gate $0 (price≠work)", () => {
  const deepMeta = { mode: "golden" as const, billable: false };
  const stdMeta = { mode: "golden" as const, billable: true };
  const deep = applyChargeGate("research_brief", "deep", deepMeta);
  const std = applyChargeGate("research_brief", "standard", stdMeta);
  assert.equal(deep.billable, false);
  assert.equal(deep.charge_usd, 0);
  assert.equal(std.billable, true);
  assert.equal(std.charge_usd, 0.6);
});

await test("soft-reserve: non-billable debit leaves balance unchanged", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "soft@reserve" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 50,
      stripeEventId: "evt_soft",
      checkoutSessionId: "cs_soft",
    });
    // Sample / quality-fail path: soft-reserve 0, no debit
    const gate = applyChargeGate("research_brief", "deep", {
      mode: "golden",
      billable: false,
    });
    assert.equal(gate.billable, false);
    const result = debitIfBillable(db, {
      customerId,
      billable: gate.billable,
      chargeUsd: gate.charge_usd,
      usageRequestId: "req_soft",
      tool: "research_brief",
      depth: "deep",
    });
    assert.equal(result.debited, false);
    assert.equal(getBalanceCents(db, customerId), 50);
  });
});

await test("assertSufficientCredits still required only for billable SKU path", async () => {
  await withDb(async (db) => {
    const customerId = upsertCustomer(db, { email: "pre@check" });
    grantPackCredits(db, {
      customerId,
      creditsCents: 10,
      stripeEventId: "evt_pre",
      checkoutSessionId: "cs_pre",
    });
    // Full SKU deep (150¢) with only 10¢ → throws
    assert.throws(
      () => assertSufficientCredits(db, customerId, "research_brief", "deep"),
      (err: unknown) => err instanceof InsufficientCreditsError,
    );
    // Lite lookup (25¢) also throws with 10¢
    assert.throws(
      () => assertSufficientCredits(db, customerId, "source_lookup"),
      (err: unknown) => err instanceof InsufficientCreditsError,
    );
  });
});



process.stdout.write(`\nbilling tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
