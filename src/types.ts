/** Shared research MCP types aligned to quality-bars.md + published contract */

import type { FailGate } from "./contract.js";
import { SCHEMA_VERSION } from "./contract.js";

export type Confidence = "high" | "medium" | "low" | "unknown";
export type SourceType = "primary" | "secondary";
export type Depth = "quick" | "standard" | "deep";
/** unaudited = claim not live-fetched (off-golden non-URL); never treat as found */
export type LookupVerdict =
  | "found"
  | "not_found"
  | "moved"
  | "conflicting"
  | "blocked"
  | "unaudited";

export type ResearchMode = "golden" | "sample" | "live";

export interface ResearchMeta {
  /** How the answer was produced */
  mode: ResearchMode;
  /**
   * Charge only when work matches the SKU:
   * - golden-matched at the fixture's authored depth (typically standard)
   * - live-fetched AND quality-bar-passing
   * Depth-mismatched goldens, sample, snippet-only live, preview paths → false
   */
  billable: boolean;
}

/** Load-bearing claim with quote (aligns with quote gate). */
export interface ClaimExcerpt {
  claim: string;
  quote: string;
  source_url: string;
}

export interface Source {
  title: string;
  url: string;
  publisher: string;
  accessed: string;
  type: SourceType;
  supports: string;
  /**
   * Honest fetch provenance for the page body behind this source (P4).
   * Always set on live-pipeline sources: cached | live.
   */
  source?: "cached" | "live";
  /** When the page body was retrieved (ISO-8601), if known. */
  retrieved_at?: string;
}

export interface ResearchEnvelope {
  tldr: string;
  body: unknown;
  confidence: Confidence;
  sources: Source[];
  gaps: string[];
  as_of: string;
  meta?: ResearchMeta;
  /** Published contract version (e.g. 2026-09-14). */
  schema_version?: string;
  /** Present when the charge/quality gate failed or path was non-billable. */
  fail_gate?: FailGate;
  /** Envelope-level retrieval timestamp (ISO-8601), if applicable. */
  retrieved_at?: string;
  /** Load-bearing claims / excerpts (live brief quote gate). */
  claims?: ClaimExcerpt[];
}

export interface ResearchBriefResult extends ResearchEnvelope {
  query: string;
  depth: Depth;
}

export interface CompareOptionsResult extends ResearchEnvelope {
  options: string[];
  question: string;
  criteria: string[];
}

export interface SourceLookupResult extends ResearchEnvelope {
  claim_or_url: string;
  ask: string;
  verdict: LookupVerdict;
  http_status: number | null;
}

export const AS_OF = "2026-09-12";

/** Re-export for callers that import AS_OF + schema together. */
export { SCHEMA_VERSION };

/** Injectable fetch for deterministic off-golden tests */
export type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Injectable search for lookup miss → replacement URL (returns candidate URLs) */
export type SearchFn = (query: string) => Promise<string[]>;

/**
 * Depth goldens were authored for. Billing policy: unchanged golden bodies are
 * billable only when caller depth equals this (price must match work).
 */
export const GOLDEN_BRIEF_AUTHORED_DEPTH: Depth = "standard";
