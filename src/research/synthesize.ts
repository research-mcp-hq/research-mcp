/**
 * Local deterministic synthesizer (quoted v1). No LLM, no MCP Sampling.
 * Emits { claim, quote, source_url }[] where each quote is a verbatim sentence
 * from extracted page text that shares meaningful query tokens — required by
 * the quote gate for live billing. Random homepage first-sentences without
 * query overlap are skipped (fail-closed / not billable).
 */

import { AS_OF, type Confidence, type Depth, type Source, type SourceType } from "../types.js";
import { extractPageDate } from "./samples.js";
import type { ExtractedPage, SynthesizeInput, SynthesizeOutput } from "./providers/types.js";
import { briefDensityOk } from "./bar.js";
import {
  claimTiedToQuery,
  extractSentences,
  type ClaimQuote,
  MIN_QUOTE_CHARS,
} from "./quote-gate.js";

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

/**
 * Pick the first substantial sentence on a page that is query-tied
 * (claim+quote share meaningful query tokens after stopword filter).
 * Prefer: require real overlap — do not fall back to arbitrary first sentence.
 */
export function pickQueryTiedQuote(
  pageText: string,
  query: string,
): string | null {
  const sentences = extractSentences(pageText, MIN_QUOTE_CHARS);
  for (const sentence of sentences) {
    // Probe with a claim shaped like the synthesizer's claim line.
    if (claimTiedToQuery(query, sentence, sentence)) {
      return sentence;
    }
  }
  return null;
}

/**
 * Build load-bearing claims from extracted pages: one claim per usable page,
 * quote = first substantial verbatim sentence that shares query tokens.
 * Pages whose text has no query-tied sentence are skipped (fail-closed).
 */
export function buildClaimsFromPages(
  pages: ExtractedPage[],
  query: string,
): ClaimQuote[] {
  const claims: ClaimQuote[] = [];
  const seenQuotes = new Set<string>();

  for (const page of pages) {
    if (!page.url || !page.text?.trim()) continue;
    const quote = pickQueryTiedQuote(page.text, query);
    if (!quote) continue;
    const key = quote.toLowerCase();
    if (seenQuotes.has(key)) continue;
    seenQuotes.add(key);

    const title = page.title || hostname(page.url);
    const claim = `From ${title}: ${excerpt(quote, 160)}`;
    // Double-check claim+quote together still pass (title may add noise but not tokens).
    if (!claimTiedToQuery(query, claim, quote)) continue;
    claims.push({ claim, quote, source_url: page.url });
  }
  return claims;
}

export function synthesizeBrief(input: SynthesizeInput): SynthesizeOutput {
  const { query, depth, pages } = input;
  const usable = pages.filter((p) => p.text.trim().length > 0 && p.url);
  const sources = pagesToSources(usable);
  const density = briefDensityOk(sources, depth);
  const primaries = sources.filter((s) => s.type === "primary").length;
  const claims = buildClaimsFromPages(usable, query);

  let confidence: Confidence;
  if (usable.length === 0 || claims.length === 0) {
    confidence = "unknown";
  } else if (!density) {
    confidence = "low";
  } else if (primaries >= 2 && claims.length >= 2) {
    // Quotes attached from fetched pages; density met → medium (high reserved for richer synth).
    confidence = "medium";
  } else {
    confidence = "medium";
  }

  const titles = usable.map((p) => p.title || hostname(p.url)).slice(0, 4);
  const dates = usable
    .map((p) => p.date ?? extractPageDate(p.text))
    .filter((d): d is string => Boolean(d));

  const tldr =
    usable.length === 0
      ? `Live ${depth} brief for “${query.slice(0, 120)}” extracted no usable page text.`
      : claims.length === 0
        ? `Live ${depth} brief for “${query.slice(0, 120)}” from ${usable.length} page(s) but no query-tied quotable sentences (≥${MIN_QUOTE_CHARS} chars + query token overlap).`
        : `Live ${depth} brief for “${query.slice(0, 120)}” from ${usable.length} extracted page(s)` +
          `${titles.length ? ` (${titles.join("; ")})` : ""}. ` +
          `${claims.length} load-bearing claim(s) cited with verbatim quotes from fetched pages.`;

  const gaps: string[] = [];
  if (claims.length === 0) {
    gaps.push(
      "No query-tied load-bearing claims with quotes could be attached from extracted text — quote gate will fail (billable=false). local-quoted-v1 requires claim/quote ↔ query token overlap.",
    );
  }
  if (!density) {
    gaps.push(
      `Density bar not met for depth=${depth} (unique=${new Set(sources.map((s) => s.url)).size}, primaries=${primaries}).`,
    );
  }
  if (dates.length < usable.length) {
    gaps.push("One or more extracted pages had no detectable date.");
  }
  // Honesty gap: local-quoted-v1 is extractive + query-token-gated, not a full synthesizer.
  gaps.push(
    "local-quoted-v1: bills only when density + source_url-bound quotes + query-token overlap all pass; not a query-tied narrative synthesizer.",
  );

  const body = {
    mode: "live" as const,
    synthesizer: "local-quoted-v1",
    claims,
    sections: {
      what: claims[0] ? claims[0].claim : usable[0] ? excerpt(usable[0].text, 280) : null,
      status: dates.length
        ? `Page dates observed on extracted sources: ${dates.join(", ")}.`
        : "No page dates detected on extracted sources.",
      implications:
        "Prefer the primaries listed in sources over secondary roundups. Re-fetch before treating dates as still current.",
      bullets: claims.map((c) => c.claim),
    },
    extracted: usable.map((p) => ({
      title: p.title,
      url: p.url,
      publisher: p.publisher || hostname(p.url),
      date: p.date ?? extractPageDate(p.text),
      excerpt: excerpt(p.text, 180),
    })),
  };

  return { tldr, body, confidence, sources, gaps, claims };
}

export function synthesizeForDepth(
  query: string,
  depth: Depth,
  pages: ExtractedPage[],
): SynthesizeOutput {
  return synthesizeBrief({ query, depth, pages });
}
