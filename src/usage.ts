/**
 * Usage metering stub. Logs JSON lines to stdout so Stripe / x402 can plug in later.
 *
 * Charge gate:
 * - golden-matched → billable (SKU estimate)
 * - live-fetched AND quality-bar-passing → billable
 * - sample/demo path → estimatedCostUsd 0, billable false
 * - quality bar fail / snippet-only live → no charge
 */

import type { ResearchMeta } from "./types.js";

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
    process.stdout.write(`${JSON.stringify({ type: "usage", ...event })}\n`);
  }
}
