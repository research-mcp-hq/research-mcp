/**
 * Density + confidence bar for live research_brief (quality-bars.md).
 * Charge only when both pass.
 */

import type { Confidence, Depth, Source } from "../types.js";

export function briefDensityOk(sources: Source[], depth: Depth): boolean {
  const uniq = new Set(sources.map((s) => s.url));
  const primaries = sources.filter((s) => s.type === "primary");
  if (depth === "quick") return uniq.size >= 2 && primaries.length >= 1;
  if (depth === "deep") return uniq.size >= 6 && primaries.length >= 3;
  return uniq.size >= 4 && primaries.length >= 2;
}

export function briefConfidenceOk(confidence: Confidence): boolean {
  return confidence === "medium" || confidence === "high";
}

export function briefBarPassing(
  sources: Source[],
  depth: Depth,
  confidence: Confidence,
): boolean {
  return briefDensityOk(sources, depth) && briefConfidenceOk(confidence);
}
