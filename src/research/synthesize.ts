/**
 * Local deterministic synthesizer (v0). No LLM, no MCP Sampling.
 * Restates only extracted pages — never invents URLs, quotes, dates, or named sources.
 */

import { AS_OF, type Confidence, type Depth, type Source, type SourceType } from "../types.js";
import { extractPageDate } from "./samples.js";
import type { ExtractedPage, SynthesizeInput, SynthesizeOutput } from "./providers/types.js";
import { briefDensityOk } from "./bar.js";

function hostname(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "unknown";
  }
}

function excerpt(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/** First-party docs/spec hosts (whole host). */
const PRIMARY_HOSTS_WHOLE: RegExp[] = [
  /(?:^|\.)modelcontextprotocol\.io$/i,
  /(?:^|\.)a2a-protocol\.org$/i,
  /(?:^|\.)developers\.openai\.com$/i,
];

/** Hosts that are primary only on docs/spec/press path prefixes. */
const PRIMARY_HOST_PATHS: Array<{ host: RegExp; path: RegExp }> = [
  { host: /(?:^|\.)anthropic\.com$/i, path: /\/(news|docs)(\b|\/)/i },
  { host: /(?:^|\.)linuxfoundation\.org$/i, path: /\/press(\b|\/)/i },
];

/** GitHub orgs whose repos count as primary (not arbitrary github.com). */
const GITHUB_ORG_ALLOWLIST = new Set([
  "modelcontextprotocol",
  "a2aproject",
]);

/**
 * Allowlist primary heuristic: first-party docs/spec/press hosts + known GitHub orgs.
 * Does NOT treat arbitrary github.com or loose /docs/ as primary.
 */
export function classifySourceType(url: string): SourceType {
  let host = "unknown";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    path = u.pathname;
  } catch {
    return "secondary";
  }

  // GitHub: only known org allowlist (e.g. modelcontextprotocol/, a2aproject/)
  if (/^(?:www\.)?github\.com$/i.test(host)) {
    const m = path.match(/^\/([^/]+)\//);
    if (m && GITHUB_ORG_ALLOWLIST.has(m[1]!.toLowerCase())) {
      return "primary";
    }
    return "secondary";
  }

  if (PRIMARY_HOSTS_WHOLE.some((re) => re.test(host))) {
    return "primary";
  }

  for (const rule of PRIMARY_HOST_PATHS) {
    if (rule.host.test(host) && rule.path.test(path)) {
      return "primary";
    }
  }

  // Explicit official spec/press patterns on already-trusted-looking first-party hosts only
  // (kept narrow — no loose /docs/ on arbitrary domains).
  if (
    /(?:^|\.)openai\.com$/i.test(host) &&
    /\/(docs|research|index\/news)\b/i.test(path)
  ) {
    return "primary";
  }

  return "secondary";
}

export function pagesToSources(pages: ExtractedPage[]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const page of pages) {
    if (!page.url || seen.has(page.url)) continue;
    seen.add(page.url);
    const date = page.date ?? extractPageDate(page.text) ?? null;
    const snippet = excerpt(page.text, 140);
    sources.push({
      title: page.title || page.url,
      url: page.url,
      publisher: page.publisher || hostname(page.url),
      accessed: AS_OF,
      type: classifySourceType(page.url),
      supports: date
        ? `Fetched page (${date}): ${snippet}`
        : `Fetched page: ${snippet}`,
    });
  }
  return sources;
}

export function synthesizeBrief(input: SynthesizeInput): SynthesizeOutput {
  const { query, depth, pages } = input;
  const usable = pages.filter((p) => p.text.trim().length > 0 && p.url);
  const sources = pagesToSources(usable);
  const density = briefDensityOk(sources, depth);
  const primaries = sources.filter((s) => s.type === "primary").length;

  let confidence: Confidence;
  if (usable.length === 0) {
    confidence = "unknown";
  } else if (!density) {
    confidence = "low";
  } else {
    // Extractive v0 — medium even with several primaries (quote-verify is P2).
    confidence = "medium";
  }

  const titles = usable.map((p) => p.title || hostname(p.url)).slice(0, 4);
  const dates = usable
    .map((p) => p.date ?? extractPageDate(p.text))
    .filter((d): d is string => Boolean(d));

  const tldr =
    usable.length === 0
      ? `Live ${depth} brief for “${query.slice(0, 120)}” extracted no usable page text.`
      : `Live ${depth} brief for “${query.slice(0, 120)}” from ${usable.length} extracted page(s)` +
        `${titles.length ? ` (${titles.join("; ")})` : ""}. ` +
        `Claims below are restated from fetched pages only; v0 synthesizer is extractive.`;

  const gaps: string[] = [
    // TODO(P2 quote gate): verified quotes required before live briefs can bill.
    "v0 synthesizer is extractive collage (not decision-ready). Quote gate required for billing — extractive live output never bills customers (billable=false).",
  ];
  if (!density) {
    gaps.push(
      `Density bar not met for depth=${depth} (unique=${new Set(sources.map((s) => s.url)).size}, primaries=${primaries}).`,
    );
  }
  if (dates.length < usable.length) {
    gaps.push("One or more extracted pages had no detectable date.");
  }

  const body = {
    mode: "live" as const,
    synthesizer: "local-extractive-v0",
    sections: {
      what: usable[0] ? excerpt(usable[0].text, 280) : null,
      status: dates.length
        ? `Page dates observed on extracted sources: ${dates.join(", ")}.`
        : "No page dates detected on extracted sources.",
      implications:
        "Prefer the primaries listed in sources over secondary roundups. Re-fetch before treating dates as still current.",
    },
    extracted: usable.map((p) => ({
      title: p.title,
      url: p.url,
      publisher: p.publisher || hostname(p.url),
      date: p.date ?? extractPageDate(p.text),
      excerpt: excerpt(p.text, 180),
    })),
  };

  return { tldr, body, confidence, sources, gaps };
}

export function synthesizeForDepth(
  query: string,
  depth: Depth,
  pages: ExtractedPage[],
): SynthesizeOutput {
  return synthesizeBrief({ query, depth, pages });
}
