/**
 * Live research_brief pipeline: search → extract N pages (capped) → synthesize.
 * Injectable provider (tests use MockProvider). Fail-closed on COGS over-cap.
 * Phase 1 of optimization-brief.md — standard (and quick). Deep is not wired.
 */

import {
  AS_OF,
  type Depth,
  type ResearchBriefResult,
} from "../types.js";
import { briefBarPassing } from "./bar.js";
import {
  affordableExtractPages,
  loadCogsConfig,
  planBeforeSearch,
  type CogsConfig,
} from "./cogs.js";
import type { ExtractedPage, ResearchProvider } from "./providers/types.js";
import { synthesizeBrief } from "./synthesize.js";

export interface LiveBriefOpts {
  provider: ResearchProvider;
  cogs?: CogsConfig;
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function cogsAbortResult(
  query: string,
  depth: Depth,
  projectedCents: number,
  capCents: number,
  asOfHint?: string,
): ResearchBriefResult {
  const gaps = [
    `Projected COGS ${projectedCents}¢ exceeds cap ${capCents}¢ for depth=${depth}. Fail-closed; not charged (billable=false).`,
    "Raise COGS_CAP_CENTS_* or lower COGS_*_UNIT_CENTS / page cap to proceed.",
  ];
  if (asOfHint) {
    gaps.push(`Caller as_of_hint=${asOfHint}; live abort did not fetch pages.`);
  }
  return {
    query,
    depth,
    tldr: `Live research aborted: projected COGS (${projectedCents}¢) exceeds the configured cap (${capCents}¢) for depth=${depth}. Not charged.`,
    body: {
      mode: "live",
      billable: false,
      cogs_abort: true,
      projected_cents: projectedCents,
      cap_cents: capCents,
    },
    confidence: "unknown",
    sources: [],
    gaps,
    as_of: AS_OF,
    meta: { mode: "live", billable: false },
  };
}

/**
 * Run search → extract → synthesize. Returns a live envelope, or null so the
 * caller can fall back to sample (search/extract hard failure).
 * COGS over-cap returns a live fail-closed envelope (not null).
 */
export async function runLiveBriefPipeline(
  input: { query: string; depth: Depth; as_of_hint?: string },
  opts: LiveBriefOpts,
): Promise<ResearchBriefResult | null> {
  const { query, depth, as_of_hint } = input;
  const provider = opts.provider;
  const cogs = opts.cogs ?? loadCogsConfig();

  const pre = planBeforeSearch(cogs, depth);
  if (!pre.ok) {
    return cogsAbortResult(query, depth, pre.projectedCents, pre.capCents, as_of_hint);
  }

  let urls: string[] = [];
  try {
    urls = await provider.search(query);
  } catch {
    return null;
  }
  const candidates = [...new Set(urls.filter(isHttpUrl))];
  if (candidates.length === 0) return null;

  const plan = affordableExtractPages(cogs, depth, candidates.length);
  if (!plan.ok) {
    return cogsAbortResult(query, depth, plan.projectedCents, plan.capCents, as_of_hint);
  }

  const toFetch = candidates.slice(0, plan.pages);
  const pages: ExtractedPage[] = [];
  for (const url of toFetch) {
    try {
      const page = await provider.fetchExtract(url);
      if (page?.text && page.text.trim().length > 0) {
        pages.push({ ...page, url: page.url || url });
      }
    } catch {
      // skip failed extracts; continue
    }
  }
  if (pages.length === 0) return null;

  try {
    const usedProviderSynthesize = typeof provider.synthesize === "function";
    const synth = usedProviderSynthesize
      ? await provider.synthesize!({ query, depth, pages })
      : synthesizeBrief({ query, depth, pages });

    // Density+confidence scaffolding still computed (future quote-gate + billing).
    const densityConfidenceOk = briefBarPassing(
      synth.sources,
      depth,
      synth.confidence,
    );

    // TODO(P2 quote gate): require verified quotes before live standard can bill.
    // Extractive v0 (local-extractive collage) is never decision-ready → never bills.
    const bodySynth =
      synth.body && typeof synth.body === "object"
        ? (synth.body as Record<string, unknown>)
        : null;
    const synthesizerId =
      typeof bodySynth?.synthesizer === "string" ? bodySynth.synthesizer : null;
    const isExtractive =
      (synthesizerId != null && /extractive/i.test(synthesizerId)) ||
      !usedProviderSynthesize ||
      synthesizerId === "local-extractive-v0";

    // Extractive live path: always meta.billable=false (even if density scaffolding passes).
    const billable = densityConfidenceOk && !isExtractive;

    const gaps = [...synth.gaps];
    if (isExtractive) {
      gaps.push(
        "Extractive collage / not decision-ready — quote gate required for billing (billable=false).",
      );
    } else if (!billable) {
      gaps.push(
        "Live brief did not meet density+confidence bar — not charged (billable=false).",
      );
    }
    if (as_of_hint) {
      gaps.push(`Caller as_of_hint=${as_of_hint}; extracted pages accessed ${AS_OF}.`);
    }

    const body =
      bodySynth != null
        ? {
            ...bodySynth,
            mode: "live",
            billable,
            density_confidence_ok: densityConfidenceOk,
            cogs: {
              projected_cents: plan.projectedCents,
              cap_cents: plan.capCents,
              extracted: pages.length,
              provider: provider.id,
            },
          }
        : { mode: "live", billable, density_confidence_ok: densityConfidenceOk };

    return {
      query,
      depth,
      tldr: synth.tldr,
      body,
      confidence: synth.confidence,
      sources: synth.sources,
      gaps,
      as_of: AS_OF,
      meta: { mode: "live", billable },
    };
  } catch {
    return null;
  }
}

export { briefBarPassing, briefDensityOk, briefConfidenceOk } from "./bar.js";
