import { randomUUID } from "node:crypto";
import { estimateUsage } from "../usage.js";
import type { LedgerDb } from "./db.js";

export type Sku = "lite" | "standard" | "deep";

export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits" as const;
  readonly balanceCents: number;
  readonly requiredCents: number;

  constructor(balanceCents: number, requiredCents: number) {
    super(
      `insufficient_credits: balance ${balanceCents} cents, need ${requiredCents} cents. Top up via POST /billing/checkout.`,
    );
    this.name = "InsufficientCreditsError";
    this.balanceCents = balanceCents;
    this.requiredCents = requiredCents;
  }
}

export function skuForTool(tool: string, depth?: string): Sku {
  if (tool === "research_brief") {
    if (depth === "deep") return "deep";
    if (depth === "quick") return "lite";
    return "standard";
  }
  if (tool === "compare_options") return "standard";
  return "lite"; // source_lookup
}

export function centsForSku(sku: Sku): number {
  if (sku === "deep") return 150;
  if (sku === "standard") return 60;
  return 25;
}

export function requiredCentsForTool(tool: string, depth?: string): number {
  return Math.round(estimateUsage(tool, depth).estimatedCostUsd * 100);
}

export function getBalanceCents(db: LedgerDb, customerId: string): number {
  const row = db.get<{ balance_cents: number }>(
    `SELECT balance_cents FROM credit_accounts WHERE customer_id = ?`,
    [customerId],
  );
  return row?.balance_cents ?? 0;
}

/**
 * Pre-check before expensive work for customer keys.
 * Server skips this (soft-reserve 0) when the path is known non-billable
 * (sample, depth-mismatched golden, snippet-only live, non-URL unaudited).
 */
export function assertSufficientCredits(
  db: LedgerDb,
  customerId: string,
  tool: string,
  depth?: string,
): void {
  const required = requiredCentsForTool(tool, depth);
  const balance = getBalanceCents(db, customerId);
  if (balance < required) {
    throw new InsufficientCreditsError(balance, required);
  }
}

export interface DebitResult {
  debited: boolean;
  balanceCents: number;
  deltaCents: number;
  sku?: Sku;
}

/**
 * Debit if billable. Never goes negative.
 * Non-billable / zero charge → no debit.
 * Break-glass callers should skip this entirely.
 */
export function debitIfBillable(
  db: LedgerDb,
  opts: {
    customerId: string;
    billable: boolean;
    chargeUsd: number;
    usageRequestId: string;
    tool: string;
    depth?: string;
  },
): DebitResult {
  if (!opts.billable || opts.chargeUsd <= 0) {
    return {
      debited: false,
      balanceCents: getBalanceCents(db, opts.customerId),
      deltaCents: 0,
    };
  }

  const sku = skuForTool(opts.tool, opts.depth);
  const required = centsForSku(sku);
  const delta = -required;

  return db.transaction((tx) => {
    const row = tx.get<{ balance_cents: number }>(
      `SELECT balance_cents FROM credit_accounts WHERE customer_id = ?`,
      [opts.customerId],
    );
    const balance = row?.balance_cents ?? 0;
    if (balance < required) {
      throw new InsufficientCreditsError(balance, required);
    }
    const now = new Date().toISOString();
    const newBalance = balance - required;
    tx.run(
      `UPDATE credit_accounts SET balance_cents = ?, updated_at = ? WHERE customer_id = ?`,
      [newBalance, now, opts.customerId],
    );
    tx.run(
      `INSERT INTO ledger_entries
        (id, customer_id, delta_cents, reason, stripe_event_id, checkout_session_id, usage_request_id, sku, created_at)
       VALUES (?, ?, ?, 'usage', NULL, NULL, ?, ?, ?)`,
      [randomUUID(), opts.customerId, delta, opts.usageRequestId, sku, now],
    );
    return {
      debited: true,
      balanceCents: newBalance,
      deltaCents: delta,
      sku,
    };
  });
}

export interface CreditGrantResult {
  granted: boolean;
  alreadyGranted: boolean;
  customerId: string;
  creditsCents: number;
  balanceCents: number;
}

/**
 * Idempotent pack credit grant. Unique on stripe_event_id and app-enforced
 * single pack_purchase per checkout_session_id.
 */
export function grantPackCredits(
  db: LedgerDb,
  opts: {
    customerId: string;
    creditsCents: number;
    stripeEventId: string;
    checkoutSessionId: string;
  },
): CreditGrantResult {
  // Event already processed?
  const byEvent = db.get<{ id: string }>(
    `SELECT id FROM ledger_entries WHERE stripe_event_id = ?`,
    [opts.stripeEventId],
  );
  if (byEvent) {
    return {
      granted: false,
      alreadyGranted: true,
      customerId: opts.customerId,
      creditsCents: opts.creditsCents,
      balanceCents: getBalanceCents(db, opts.customerId),
    };
  }

  // Session already granted?
  const bySession = db.get<{ id: string }>(
    `SELECT id FROM ledger_entries
     WHERE checkout_session_id = ? AND reason = 'pack_purchase'`,
    [opts.checkoutSessionId],
  );
  if (bySession) {
    // Record that we saw this event without double-crediting — insert a no-op
    // marker is unnecessary; just return idempotent success.
    return {
      granted: false,
      alreadyGranted: true,
      customerId: opts.customerId,
      creditsCents: opts.creditsCents,
      balanceCents: getBalanceCents(db, opts.customerId),
    };
  }

  const now = new Date().toISOString();
  return db.transaction((tx) => {
    const row = tx.get<{ balance_cents: number }>(
      `SELECT balance_cents FROM credit_accounts WHERE customer_id = ?`,
      [opts.customerId],
    );
    const balance = row?.balance_cents ?? 0;
    const newBalance = balance + opts.creditsCents;
    if (row) {
      tx.run(
        `UPDATE credit_accounts SET balance_cents = ?, updated_at = ? WHERE customer_id = ?`,
        [newBalance, now, opts.customerId],
      );
    } else {
      tx.run(
        `INSERT INTO credit_accounts (customer_id, balance_cents, updated_at) VALUES (?, ?, ?)`,
        [opts.customerId, newBalance, now],
      );
    }
    tx.run(
      `INSERT INTO ledger_entries
        (id, customer_id, delta_cents, reason, stripe_event_id, checkout_session_id, usage_request_id, sku, created_at)
       VALUES (?, ?, ?, 'pack_purchase', ?, ?, NULL, NULL, ?)`,
      [
        randomUUID(),
        opts.customerId,
        opts.creditsCents,
        opts.stripeEventId,
        opts.checkoutSessionId,
        now,
      ],
    );
    return {
      granted: true,
      alreadyGranted: false,
      customerId: opts.customerId,
      creditsCents: opts.creditsCents,
      balanceCents: newBalance,
    };
  });
}

export function upsertCustomer(
  db: LedgerDb,
  opts: {
    id?: string;
    stripeCustomerId?: string | null;
    email?: string | null;
  },
): string {
  const now = new Date().toISOString();

  if (opts.stripeCustomerId) {
    const existing = db.get<{ id: string }>(
      `SELECT id FROM customers WHERE stripe_customer_id = ?`,
      [opts.stripeCustomerId],
    );
    if (existing) {
      if (opts.email) {
        db.run(`UPDATE customers SET email = ? WHERE id = ?`, [
          opts.email,
          existing.id,
        ]);
      }
      return existing.id;
    }
  }

  const id = opts.id ?? randomUUID();
  db.run(
    `INSERT INTO customers (id, stripe_customer_id, email, created_at) VALUES (?, ?, ?, ?)`,
    [id, opts.stripeCustomerId ?? null, opts.email ?? null, now],
  );
  db.run(
    `INSERT OR IGNORE INTO credit_accounts (customer_id, balance_cents, updated_at) VALUES (?, 0, ?)`,
    [id, now],
  );
  return id;
}
