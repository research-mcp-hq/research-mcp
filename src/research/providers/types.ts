/**
 * Injectable research provider: search → fetch/extract.
 * Parallel/Exa/Tavily implementations are out of scope until Michael provides keys.
 */

import type { Confidence, Depth, Source } from "../../types.js";
import type { ClaimQuote } from "../quote-gate.js";

export type { ClaimQuote };

export interface ExtractedPage {
  url: string;
  text: string;
  title: string;
  publisher?: string;
  date?: string;
  /** Honest cache provenance when page body came from cache (P4). */
  fetch_source?: "cached" | "live";
}

export interface ProviderCallOpts {
  /** Cancel in-flight search/extract when aborted (P3a). */
  signal?: AbortSignal;
}

export interface SynthesizeInput {
  query: string;
  depth: Depth;
  pages: ExtractedPage[];
}

export interface SynthesizeOutput {
  tldr: string;
  body: unknown;
  confidence: Confidence;
  sources: Source[];
  gaps: string[];
  /**
   * Load-bearing claims with quotes for the quote gate.
   * Required for live billing — empty/missing → fail closed.
   */
  claims?: ClaimQuote[];
}

export interface ResearchProvider {
  /** Stable id for logs/tests (`mock`, `local-http`, …). */
  readonly id: string;
  /** Return candidate page URLs for the query (no page bodies). */
  search(query: string, opts?: ProviderCallOpts): Promise<string[]>;
  /** Fetch and extract a single page. Throw on failure / abort. */
  fetchExtract(url: string, opts?: ProviderCallOpts): Promise<ExtractedPage>;
  /** Optional provider-side synthesizer. Default: local quoted synthesizer. */
  synthesize?(input: SynthesizeInput): Promise<SynthesizeOutput>;
}
