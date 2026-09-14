/**
 * T10 — Visible meter: GET /billing/credits
 * Locked SKUs: packs $10/$25/$50; meters lite $0.25 / standard $0.60 / deep $1.50; fail=$0.
 */

import type { Request, Response } from "express";
import { PACK_CREDITS_CENTS } from "./config.js";
import { getLedgerDb } from "./db.js";
import { centsForSku, getBalanceCents } from "./ledger.js";
import { SCHEMA_VERSION } from "../contract.js";

/** Public meter tables — do not change without product lock. */
export const METER_USD = {
  lite: 0.25,
  standard: 0.6,
  deep: 1.5,
} as const;

export const FAIL_USD = 0;

export interface CreditsResponse {
  schema_version: string;
  balance_cents: number | null;
  balance_usd: number | null;
  packs: {
    starter: number;
    standard: number;
    pro: number;
  };
  meters_usd: typeof METER_USD;
  meters_cents: {
    lite: number;
    standard: number;
    deep: number;
  };
  fail_usd: number;
  break_glass?: boolean;
  customer_id?: string;
  last_usage?: {
    requestId: string | null;
    tool: string | null;
    billable: boolean | null;
    charge_usd: number | null;
    mode: string | null;
    timestamp: string | null;
    sku: string | null;
  };
}

function packsTable() {
  return {
    starter: PACK_CREDITS_CENTS.starter,
    standard: PACK_CREDITS_CENTS.standard,
    pro: PACK_CREDITS_CENTS.pro,
  };
}

function metersCents() {
  return {
    lite: centsForSku("lite"),
    standard: centsForSku("standard"),
    deep: centsForSku("deep"),
  };
}

function lastUsageForCustomer(
  db: NonNullable<ReturnType<typeof getLedgerDb>>,
  customerId: string,
): CreditsResponse["last_usage"] | undefined {
  const row = db.get<{
    usage_request_id: string | null;
    sku: string | null;
    delta_cents: number;
    reason: string;
    created_at: string;
  }>(
    `SELECT usage_request_id, sku, delta_cents, reason, created_at
     FROM ledger_entries
     WHERE customer_id = ? AND reason = 'usage_debit'
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId],
  );
  if (!row) return undefined;
  const chargeCents = Math.abs(row.delta_cents);
  return {
    requestId: row.usage_request_id,
    tool: null,
    billable: true,
    charge_usd: chargeCents / 100,
    mode: null,
    timestamp: row.created_at,
    sku: row.sku,
  };
}

/**
 * Express handler for GET /billing/credits.
 * Customer key → balance; break-glass → ops shape (no fake balance).
 */
export function handleBillingCredits(req: Request, res: Response): void {
  const auth = req.authContext;
  if (!auth) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key.",
    });
    return;
  }

  const base = {
    schema_version: SCHEMA_VERSION,
    packs: packsTable(),
    meters_usd: { ...METER_USD },
    meters_cents: metersCents(),
    fail_usd: FAIL_USD,
  };

  if (auth.breakGlass) {
    res.status(200).json({
      ...base,
      balance_cents: null,
      balance_usd: null,
      break_glass: true,
    } satisfies CreditsResponse);
    return;
  }

  if (!auth.customerId) {
    res.status(401).json({
      error: "unauthorized",
      message: "Customer API key required for credit balance",
    });
    return;
  }

  const db = getLedgerDb();
  if (!db) {
    res.status(500).json({
      error: "billing_misconfigured",
      message: "DATABASE_URL required for credit balance",
    });
    return;
  }

  const balance_cents = getBalanceCents(db, auth.customerId);
  const last_usage = lastUsageForCustomer(db, auth.customerId);

  const body: CreditsResponse = {
    ...base,
    balance_cents,
    balance_usd: balance_cents / 100,
    customer_id: auth.customerId,
  };
  if (last_usage) body.last_usage = last_usage;

  res.status(200).json(body);
}
