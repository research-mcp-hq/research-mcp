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
import { defaultResearchProvider } from "./providers/index.js";
import type { ResearchProvider } from "./providers/types.js";
import { isGoldenBriefQuery, resolveBrief, resolveCompare, resolveLookup } from "./samples.js";

export interface ResearchBriefOpts {
  /** Injectable provider (tests: MockProvider). Production: defaultResearchProvider(). */
  provider?: ResearchProvider;
  cogs?: CogsConfig;
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

export { runLiveBriefPipeline, briefBarPassing, briefDensityOk } from "./pipeline.js";
export { MockProvider, defaultMockPages, defaultResearchProvider } from "./providers/index.js";
export { loadCogsConfig, projectCogsCents, type CogsConfig } from "./cogs.js";
