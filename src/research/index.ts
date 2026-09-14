import type {
  CompareOptionsResult,
  Depth,
  FetchFn,
  ResearchBriefResult,
  SearchFn,
  SourceLookupResult,
} from "../types.js";
import type { CogsConfig } from "./cogs.js";
import { runLiveBriefPipeline } from "./pipeline.js";
import type { PageBodyCache } from "./page-cache.js";
import type { ProgressReporter } from "./progress.js";
import { defaultResearchProvider } from "./providers/index.js";
import type { ResearchProvider } from "./providers/types.js";
import { isGoldenBriefQuery, resolveBrief, resolveCompare, resolveLookup } from "./samples.js";

export interface ResearchBriefOpts {
  /** Injectable provider (tests: MockProvider). Production: defaultResearchProvider(). */
  provider?: ResearchProvider;
  cogs?: CogsConfig;
  /** Cancel token — abort in-flight search/extract (P3a). */
  signal?: AbortSignal;
  /** Phase-only progress reporter (P3a). */
  onProgress?: ProgressReporter;
  /** Page-body cache (P4). null disables; undefined uses process default. */
  pageCache?: PageBodyCache | null;
  /** Force live extracts (bypass cache). */
  forceLive?: boolean;
}

export async function runResearchBrief(
  input: {
    query: string;
    depth: Depth;
    as_of_hint?: string;
  },
  opts?: ResearchBriefOpts,
): Promise<ResearchBriefResult> {
  // Goldens always win — frozen bodies, authored-depth billing honesty.
  if (isGoldenBriefQuery(input.query)) {
    return resolveBrief(input);
  }

  // Phase 1: live pipeline for standard (and quick). Deep stays sample.
  if (input.depth === "standard" || input.depth === "quick") {
    const provider = opts?.provider ?? defaultResearchProvider();
    if (provider) {
      try {
        const live = await runLiveBriefPipeline(input, {
          provider,
          cogs: opts?.cogs,
          signal: opts?.signal,
          onProgress: opts?.onProgress,
          pageCache: opts?.pageCache,
          forceLive: opts?.forceLive,
        });
        if (live) return live;
      } catch {
        // sample fallback
      }
    }
  }

  return resolveBrief(input);
}

export function runCompareOptions(input: {
  options: string[];
  question: string;
  criteria: string[];
}): CompareOptionsResult {
  return resolveCompare(input);
}

export async function runSourceLookup(
  input: {
    claim_or_url: string;
    ask: string;
  },
  opts?: { fetch?: FetchFn; search?: SearchFn },
): Promise<SourceLookupResult> {
  return resolveLookup(input, opts);
}

export {
  resolveBrief,
  resolveCompare,
  resolveLookup,
  briefPathMayBeBillable,
  comparePathMayBeBillable,
  lookupPathMayBeBillable,
  isGoldenBriefQuery,
} from "./samples.js";

export {
  runLiveBriefPipeline,
  briefBarPassing,
  briefDensityOk,
  createMcpProgressReporter,
  PIPELINE_PHASES,
} from "./pipeline.js";
export type { PipelinePhase, ProgressReporter } from "./progress.js";
export {
  verifyQuotes,
  quoteInPages,
  normalizeForQuoteMatch,
  type ClaimQuote,
} from "./quote-gate.js";
export { MockProvider, defaultMockPages, defaultResearchProvider } from "./providers/index.js";
export { loadCogsConfig, projectCogsCents, type CogsConfig } from "./cogs.js";
