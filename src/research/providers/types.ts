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
  search(query: string): Promise<string[]>;
  /** Fetch and extract a single page. Throw on failure. */
  fetchExtract(url: string): Promise<ExtractedPage>;
  /** Optional provider-side synthesizer. Default: local quoted synthesizer. */
  synthesize?(input: SynthesizeInput): Promise<SynthesizeOutput>;
}
