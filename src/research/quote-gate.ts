/**
 * Fail-closed quote gate (optimization-brief #2).
 * Every load-bearing claim needs a verbatim (or lightly normalized) quote
 * that appears in some extracted page text. Text match only — no LLM judge.
 * Weakest claim sets confidence; missing quotes → not billable.
 */

import type { Confidence } from "../types.js";
import type { ExtractedPage } from "./providers/types.js";

export interface ClaimQuote {
  /** Load-bearing assertion (may equal quote or be a short restatement). */
  claim: string;
  /** Verbatim (or high-threshold normalized) span expected in page text. */
  quote: string;
  /** Page URL the quote was taken from (must match an extracted page). */
  source_url: string;
}

export interface QuoteVerifyResult {
  ok: boolean;
  verified: ClaimQuote[];
  missing: ClaimQuote[];
  /** Confidence floor from the weakest claim after verify. */
  confidenceFloor: Confidence;
  /** Human-readable gaps when ok=false. */
  gaps: string[];
}

/** Min quote length after normalize — short tokens are too weak to gate on. */
export const MIN_QUOTE_CHARS = 24;

/** Collapse whitespace + lowercase for high-threshold substring match. */
export function normalizeForQuoteMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * True when quote (normalized) is a substring of some page's text.
 * Optionally prefer the page matching source_url when present.
 */
export function quoteInPages(
  quote: string,
  pages: ExtractedPage[],
  sourceUrl?: string,
): boolean {
  const nq = normalizeForQuoteMatch(quote);
  if (nq.length < MIN_QUOTE_CHARS) return false;

  const ordered =
    sourceUrl != null
      ? [
          ...pages.filter((p) => p.url === sourceUrl),
          ...pages.filter((p) => p.url !== sourceUrl),
        ]
      : pages;

  for (const page of ordered) {
    const nt = normalizeForQuoteMatch(page.text ?? "");
    if (nt.includes(nq)) return true;
  }
  return false;
}

/**
 * Verify every load-bearing claim has quote ∈ fetched page text.
 * Empty claims → fail closed (collage / no quotes attached).
 */
export function verifyQuotes(
  claims: ClaimQuote[] | undefined | null,
  pages: ExtractedPage[],
): QuoteVerifyResult {
  const list = Array.isArray(claims) ? claims : [];
  const gaps: string[] = [];

  if (list.length === 0) {
    return {
      ok: false,
      verified: [],
      missing: [],
      confidenceFloor: "unknown",
      gaps: [
        "Quote gate failed: no load-bearing claims with quotes attached. Not charged (billable=false).",
      ],
    };
  }

  const verified: ClaimQuote[] = [];
  const missing: ClaimQuote[] = [];

  for (const c of list) {
    const quote = typeof c.quote === "string" ? c.quote : "";
    const claim = typeof c.claim === "string" ? c.claim : "";
    const source_url = typeof c.source_url === "string" ? c.source_url : "";
    const entry: ClaimQuote = { claim, quote, source_url };

    if (!quote.trim() || normalizeForQuoteMatch(quote).length < MIN_QUOTE_CHARS) {
      missing.push(entry);
      gaps.push(
        `Quote gate: claim missing usable quote (≥${MIN_QUOTE_CHARS} chars after normalize): “${claim.slice(0, 80)}”.`,
      );
      continue;
    }

    if (!quoteInPages(quote, pages, source_url || undefined)) {
      missing.push(entry);
      gaps.push(
        `Quote gate: quote not found in extracted page text for “${claim.slice(0, 80)}”` +
          (source_url ? ` (source_url=${source_url})` : "") +
          ".",
      );
      continue;
    }

    verified.push(entry);
  }

  const ok = missing.length === 0 && verified.length > 0;
  if (!ok && gaps.length === 0) {
    gaps.push("Quote gate failed: one or more load-bearing claims lack verified quotes. Not charged (billable=false).");
  } else if (!ok) {
    gaps.push("Quote gate failed — not charged (billable=false).");
  }

  // Weakest claim sets floor: any miss → unknown; all verified → medium (density may raise later).
  const confidenceFloor: Confidence = ok ? "medium" : "unknown";

  return { ok, verified, missing, confidenceFloor, gaps };
}

/**
 * Split page text into candidate sentences for quote attachment.
 * Deterministic; no LLM.
 */
export function extractSentences(text: string, minLen = MIN_QUOTE_CHARS): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t.length >= minLen) out.push(t);
  }
  return out;
}
