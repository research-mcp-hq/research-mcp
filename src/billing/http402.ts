import type { Response } from "express";
import type { InsufficientCreditsError } from "./ledger.js";

/** Optional HTTP 402 helper for any HTTP tool/billing surface. */
export function sendInsufficientCredits(
  res: Response,
  err: InsufficientCreditsError,
): void {
  res.status(402).json({
    error: "insufficient_credits",
    message: err.message,
    balance_cents: err.balanceCents,
    required_cents: err.requiredCents,
  });
}

export function insufficientCreditsBody(err: InsufficientCreditsError): {
  error: "insufficient_credits";
  message: string;
  balance_cents: number;
  required_cents: number;
} {
  return {
    error: "insufficient_credits",
    message: err.message,
    balance_cents: err.balanceCents,
    required_cents: err.requiredCents,
  };
}
