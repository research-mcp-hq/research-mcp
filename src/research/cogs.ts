/**
 * Hard COGS caps per SKU. Prefer per-request unit costs over dynamic ceilings.
 * Fail-closed if projected spend would exceed the cap (optimization-brief #3).
 */

import type { Depth } from "../types.js";

export interface CogsConfig {
  capCentsQuick: number;
  capCentsStandard: number;
  capCentsDeep: number;
  searchUnitCents: number;
  extractUnitCents: number;
  synthesizeUnitCents: number;
  maxPagesQuick: number;
  maxPagesStandard: number;
  maxPagesDeep: number;
}

/** Defaults stay under SKU list prices ($0.25 / $0.60 / $1.50). */
export const DEFAULT_COGS: CogsConfig = {
  capCentsQuick: 10,
  capCentsStandard: 25,
  capCentsDeep: 50,
  searchUnitCents: 1,
  extractUnitCents: 1,
  synthesizeUnitCents: 0,
  maxPagesQuick: 3,
  maxPagesStandard: 6,
  maxPagesDeep: 8,
};

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadCogsConfig(env: NodeJS.ProcessEnv = process.env): CogsConfig {
  return {
    capCentsQuick: envInt("COGS_CAP_CENTS_QUICK", DEFAULT_COGS.capCentsQuick, env),
    capCentsStandard: envInt("COGS_CAP_CENTS_STANDARD", DEFAULT_COGS.capCentsStandard, env),
    capCentsDeep: envInt("COGS_CAP_CENTS_DEEP", DEFAULT_COGS.capCentsDeep, env),
    searchUnitCents: envInt("COGS_SEARCH_UNIT_CENTS", DEFAULT_COGS.searchUnitCents, env),
    extractUnitCents: envInt("COGS_EXTRACT_UNIT_CENTS", DEFAULT_COGS.extractUnitCents, env),
    synthesizeUnitCents: envInt(
      "COGS_SYNTHESIZE_UNIT_CENTS",
      DEFAULT_COGS.synthesizeUnitCents,
      env,
    ),
    maxPagesQuick: envInt("COGS_MAX_PAGES_QUICK", DEFAULT_COGS.maxPagesQuick, env),
    maxPagesStandard: envInt("COGS_MAX_PAGES_STANDARD", DEFAULT_COGS.maxPagesStandard, env),
    maxPagesDeep: envInt("COGS_MAX_PAGES_DEEP", DEFAULT_COGS.maxPagesDeep, env),
  };
}

export function capCentsForDepth(cfg: CogsConfig, depth: Depth): number {
  if (depth === "quick") return cfg.capCentsQuick;
  if (depth === "deep") return cfg.capCentsDeep;
  return cfg.capCentsStandard;
}

export function maxPagesForDepth(cfg: CogsConfig, depth: Depth): number {
  if (depth === "quick") return cfg.maxPagesQuick;
  if (depth === "deep") return cfg.maxPagesDeep;
  return cfg.maxPagesStandard;
}

/** Minimum extracted pages needed to have a chance at the density bar. */
export function minPagesForDensity(depth: Depth): number {
  if (depth === "quick") return 2;
  if (depth === "deep") return 6;
  return 4;
}

export function projectCogsCents(
  cfg: CogsConfig,
  extractPages: number,
  opts?: { includeSearch?: boolean; includeSynthesize?: boolean },
): number {
  const includeSearch = opts?.includeSearch !== false;
  const includeSynthesize = opts?.includeSynthesize !== false;
  const pages = Math.max(0, extractPages);
  return (
    (includeSearch ? cfg.searchUnitCents : 0) +
    pages * cfg.extractUnitCents +
    (includeSynthesize ? cfg.synthesizeUnitCents : 0)
  );
}

export function exceedsCap(projectedCents: number, capCents: number): boolean {
  return projectedCents > capCents;
}

/**
 * How many extracts we can afford under the cap (search + N extracts + synth).
 * ok=false when search alone, or a single extract, would exceed the cap.
 * Density is a separate quality bar — short candidate lists still extract what we can afford.
 */
export function affordableExtractPages(
  cfg: CogsConfig,
  depth: Depth,
  candidateCount: number,
): { pages: number; projectedCents: number; capCents: number; ok: boolean } {
  const cap = capCentsForDepth(cfg, depth);
  const maxPages = Math.min(maxPagesForDepth(cfg, depth), Math.max(0, candidateCount));
  const searchOnly = projectCogsCents(cfg, 0);
  if (exceedsCap(searchOnly, cap)) {
    return { pages: 0, projectedCents: searchOnly, capCents: cap, ok: false };
  }
  let pages = maxPages;
  while (pages > 0 && exceedsCap(projectCogsCents(cfg, pages), cap)) {
    pages -= 1;
  }
  if (pages === 0) {
    return {
      pages: 0,
      projectedCents: projectCogsCents(cfg, 1),
      capCents: cap,
      ok: false,
    };
  }
  return {
    pages,
    projectedCents: projectCogsCents(cfg, pages),
    capCents: cap,
    ok: true,
  };
}

/**
 * Project planned spend before any provider call. Abort without calling the
 * provider when even one extract (or search alone) would exceed the cap.
 */
export function planBeforeSearch(
  cfg: CogsConfig,
  depth: Depth,
): { pages: number; projectedCents: number; capCents: number; ok: boolean } {
  return affordableExtractPages(cfg, depth, maxPagesForDepth(cfg, depth));
}
