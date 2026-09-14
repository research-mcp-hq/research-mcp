import type {
  CompareOptionsResult,
  Depth,
  FetchFn,
  ResearchBriefResult,
  SearchFn,
  SourceLookupResult,
} from "../types.js";
import { liveResearchEnabled, tryLiveBriefQuick } from "./live.js";
import { resolveBrief, resolveCompare, resolveLookup } from "./samples.js";

export async function runResearchBrief(input: {
  query: string;
  depth: Depth;
  as_of_hint?: string;
}): Promise<ResearchBriefResult> {
  if (liveResearchEnabled() && input.depth === "quick") {
    const live = await tryLiveBriefQuick(input.query);
    if (live) return live;
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
} from "./samples.js";
