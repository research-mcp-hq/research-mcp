/**
 * Fail-closed quote gate (optimization-brief #2).
 * Every load-bearing claim needs a verbatim (or lightly normalized) quote
 * that appears in the claim's required source_url page text — no cross-page
 * fallback. Claims must also share real query tokens (stopword-filtered).
 * Text match only — no LLM judge. Weakest claim sets confidence; miss → not billable.
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

/** English/function-word stop list for query-token overlap (fail-closed). */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "when",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "once",
  "here",
  "there",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "don",
  "should",
  "now",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "of",
  "as",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "they",
  "them",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "why",
  "where",
  "vs",
  "versus",
  "per",
  "via",
  "etc",
  "also",
  "into",
]);

/** Collapse whitespace + lowercase for high-threshold substring match. */
export function normalizeForQuoteMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Meaningful query/claim tokens: alphanumeric runs, length ≥3, not stopwords,
 * not pure digits (years/ids are too weak to gate billing on).
 */
export function meaningfulTokens(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Count of meaningful query tokens that appear in claim and/or quote text.
 * Fail-closed: empty query tokens → 0 (caller treats as fail).
 */
export function queryTokenOverlapCount(
  query: string,
  claim: string,
  quote: string,
): number {
  const qTokens = meaningfulTokens(query);
  if (qTokens.length === 0) return 0;
  const hay = new Set(meaningfulTokens(`${claim} ${quote}`));
  let n = 0;
  for (const t of qTokens) {
    if (hay.has(t)) n += 1;
  }
  return n;
}

/** Min overlapping meaningful tokens required to count as query-tied. */
export function minQueryOverlapRequired(query: string): number {
  const n = meaningfulTokens(query).length;
  if (n === 0) return 1; // impossible → fail closed
  if (n < 3) return 1;
  return 2;
}

/** True when claim+quote share enough real query tokens. */
export function claimTiedToQuery(
  query: string,
  claim: string,
  quote: string,
): boolean {
  return (
    queryTokenOverlapCount(query, claim, quote) >= minQueryOverlapRequired(query)
  );
}

/**
 * True when quote (normalized) is a substring of the bound page's text.
 *
 * MUST: when sourceUrl is set, ONLY that URL's extracted text may match —
 * no fallback to any other page. Missing/unfetched source URL → false.
 * When sourceUrl is unset, any page may match (legacy / incomplete claims
 * still fail later if source_url is required by callers).
 */
export function quoteInPages(
  quote: string,
  pages: ExtractedPage[],
  sourceUrl?: string,
): boolean {
  const nq = normalizeForQuoteMatch(quote);
  if (nq.length < MIN_QUOTE_CHARS) return false;

  if (sourceUrl != null && sourceUrl !== "") {
    const page = pages.find((p) => p.url === sourceUrl);
    if (!page) return false;
    const nt = normalizeForQuoteMatch(page.text ?? "");
    return nt.includes(nq);
  }

  for (const page of pages) {
    const nt = normalizeForQuoteMatch(page.text ?? "");
    if (nt.includes(nq)) return true;
  }
  return false;
}

export interface VerifyQuotesOpts {
  /** When set, every claim must share meaningful tokens with this query. */
  query?: string;
}

/**
 * Verify every load-bearing claim has quote ∈ its source_url page text
 * (strict bind) and is query-tied when query is provided.
 * Empty claims → fail closed (collage / no quotes attached).
 */
export function verifyQuotes(
  claims: ClaimQuote[] | undefined | null,
  pages: ExtractedPage[],
  opts?: VerifyQuotesOpts,
): QuoteVerifyResult {
  const list = Array.isArray(claims) ? claims : [];
  const gaps: string[] = [];
  const query = opts?.query?.trim() ?? "";

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
  const pageUrls = new Set(pages.map((p) => p.url));

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

    if (!source_url.trim()) {
      missing.push(entry);
      gaps.push(
        `Quote gate: claim missing source_url for “${claim.slice(0, 80)}”. Unbound any-page match is not allowed.`,
      );
      continue;
    }
    if (!pageUrls.has(source_url)) {
      missing.push(entry);
      gaps.push(
        `Quote gate: source_url not in extracted pages for “${claim.slice(0, 80)}” (source_url=${source_url}).`,
      );
      continue;
    }
    if (!quoteInPages(quote, pages, source_url)) {
      missing.push(entry);
      gaps.push(
        `Quote gate: quote not found in source_url page text for “${claim.slice(0, 80)}” (source_url=${source_url}). No cross-page fallback.`,
      );
      continue;
    }

    if (query && !claimTiedToQuery(query, claim, quote)) {
      missing.push(entry);
      gaps.push(
        `Quote gate: claim/quote not tied to query tokens for “${claim.slice(0, 80)}”. Fail-closed (billable=false).`,
      );
      continue;
    }

    verified.push(entry);
  }

  const ok = missing.length === 0 && verified.length > 0;
  if (!ok && gaps.length === 0) {
    gaps.push(
      "Quote gate failed: one or more load-bearing claims lack verified quotes. Not charged (billable=false).",
    );
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
