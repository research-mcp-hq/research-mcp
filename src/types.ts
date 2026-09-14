/** Shared research MCP types aligned to quality-bars.md */

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
  /** Charge only golden-matched or live-fetched + quality-bar-passing */
  billable: boolean;
}

export interface Source {
  title: string;
  url: string;
  publisher: string;
  accessed: string;
  type: SourceType;
  supports: string;
}

export interface ResearchEnvelope {
  tldr: string;
  body: unknown;
  confidence: Confidence;
  sources: Source[];
  gaps: string[];
  as_of: string;
  meta?: ResearchMeta;
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

/** Injectable fetch for deterministic off-golden tests */
export type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
