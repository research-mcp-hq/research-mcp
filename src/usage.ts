/**
 * Usage metering + charge gate. Billable calls debit the SQLite ledger
 * (customer keys). Break-glass API_KEYS skip debit.
 *
 * Charge gate:
 * - golden-matched → billable (SKU estimate)
 * - live-fetched AND quality-bar-passing → billable
 * - sample/demo path → estimatedCostUsd 0, billable false
 * - quality bar fail / snippet-only live → no charge
 */

import type { ResearchMeta } from "./types.js";
import { getLedgerDb } from "./billing/db.js";
import { debitIfBillable, InsufficientCreditsError } from "./billing/ledger.js";

export interface UsageEvent {
  requestId: string;
  tool: string;
  keyId: string;
  latencyMs: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  /** Explicit charge field (0 when not billable) */
  charge_usd: number;
  billable: boolean;
  mode?: ResearchMeta["mode"];
  timestamp: string;
  /** Customer ledger id when using purchased key */
  customerId?: string;
  /** Ops env key — skip ledger debit */
  breakGlass?: boolean;
  depth?: string;
}

export interface UsageLogger {
  log(event: UsageEvent): void;
}

export function keyIdFromApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return `****${apiKey}`;
  return `...${apiKey.slice(-4)}`;
}

/** Stub SKU estimates aligned to pricing-addendum (not billing-grade). */
export function estimateUsage(
  tool: string,
  depth?: string,
): { estimatedTokens: number; estimatedCostUsd: number } {
  if (tool === "research_brief") {
    if (depth === "deep") return { estimatedTokens: 4800, estimatedCostUsd: 1.5 };
    if (depth === "quick") return { estimatedTokens: 800, estimatedCostUsd: 0.25 };
    return { estimatedTokens: 2400, estimatedCostUsd: 0.6 };
  }
  if (tool === "compare_options") {
    return { estimatedTokens: 2000, estimatedCostUsd: 0.6 };
  }
  // source_lookup
  return { estimatedTokens: 900, estimatedCostUsd: 0.25 };
}

/**
 * Apply charge gate from result meta.
 * Sample/demo = no charge; quality-bar fail = no charge; snippet-only live = no charge.
 */
export function applyChargeGate(
  tool: string,
  depth: string | undefined,
  meta: ResearchMeta | undefined,
): {
  estimatedTokens: number;
  estimatedCostUsd: number;
  charge_usd: number;
  billable: boolean;
  mode?: ResearchMeta["mode"];
} {
  const base = estimateUsage(tool, depth);
  const billable = meta?.billable === true;
  const mode = meta?.mode;
  if (!billable) {
    return {
      estimatedTokens: base.estimatedTokens,
      estimatedCostUsd: 0,
      charge_usd: 0,
      billable: false,
      mode,
    };
  }
  return {
    estimatedTokens: base.estimatedTokens,
    estimatedCostUsd: base.estimatedCostUsd,
    charge_usd: base.estimatedCostUsd,
    billable: true,
    mode,
  };
}

export class StdoutUsageLogger implements UsageLogger {
  log(event: UsageEvent): void {
    const { breakGlass, customerId, depth, ...rest } = event;
    process.stdout.write(
      `${JSON.stringify({
        type: "usage",
        ...rest,
        ...(breakGlass ? { break_glass: true } : {}),
        ...(customerId ? { customerId } : {}),
        ...(depth ? { depth } : {}),
      })}\n`,
    );
  }
}

/**
 * Logs to stdout and debits ledger for billable customer-key calls.
 * Throws InsufficientCreditsError if debit cannot proceed.
 */
export class LedgerUsageLogger implements UsageLogger {
  private stdout = new StdoutUsageLogger();

  log(event: UsageEvent): void {
    if (event.breakGlass) {
      this.stdout.log({ ...event, breakGlass: true });
      return;
    }

    const db = getLedgerDb();
    if (db && event.customerId) {
      debitIfBillable(db, {
        customerId: event.customerId,
        billable: event.billable,
        chargeUsd: event.charge_usd,
        usageRequestId: event.requestId,
        tool: event.tool,
        depth: event.depth,
      });
    }

    this.stdout.log(event);
  }
}

export { InsufficientCreditsError };
