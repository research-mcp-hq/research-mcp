/**
 * Published response contract (P0).
 * schema_version is stamped on every tool envelope.
 */

export const SCHEMA_VERSION = "2026-09-14";
export const SCHEMA_VERSION_HEADER = "X-Research-MCP-Schema-Version";

export interface FailGate {
  reason: string;
  retryable: boolean;
}

/** Attach schema_version (+ optional fail_gate) onto a tool result envelope. */
export function stampContract<T extends Record<string, unknown>>(
  result: T,
  opts?: { fail_gate?: FailGate },
): T & { schema_version: string; fail_gate?: FailGate } {
  const out = {
    ...result,
    schema_version: SCHEMA_VERSION,
  } as T & { schema_version: string; fail_gate?: FailGate };
  if (opts?.fail_gate) {
    out.fail_gate = opts.fail_gate;
  }
  return out;
}

/**
 * Derive a fail_gate from result meta / body when the charge gate failed
 * or the run aborted. Returns undefined on happy billable / golden paths.
 */
export function deriveFailGate(result: {
  meta?: { billable?: boolean; mode?: string };
  body?: unknown;
  gaps?: string[];
  confidence?: string;
}): FailGate | undefined {
  const body =
    result.body && typeof result.body === "object"
      ? (result.body as Record<string, unknown>)
      : null;

  if (body?.cogs_abort === true) {
    return {
      reason: "cogs_cap_exceeded",
      retryable: true,
    };
  }
  if (body?.cancelled === true) {
    return {
      reason: "cancelled",
      retryable: true,
    };
  }
  if (body?.quotes_verified === false) {
    return {
      reason: "quote_gate_failed",
      retryable: false,
    };
  }
  if (
    body?.density_confidence_ok === false &&
    body?.mode === "live"
  ) {
    return {
      reason: "density_bar_failed",
      retryable: false,
    };
  }
  if (result.meta?.mode === "sample") {
    return {
      reason: "sample_path",
      retryable: false,
    };
  }
  if (result.meta?.billable === false && result.meta?.mode === "golden") {
    return {
      reason: "depth_mismatch_golden",
      retryable: false,
    };
  }
  if (result.meta?.billable === false && result.meta?.mode === "live") {
    return {
      reason: "live_not_billable",
      retryable: false,
    };
  }
  return undefined;
}
