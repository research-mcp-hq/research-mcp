/**
 * Sample-path router: match golden fixtures when inputs align; otherwise
 * return varied realistic envelopes that still obey density / no-fabrication rules.
 *
 * Off-golden source_lookup:
 * - URL → real HTTP GET (injectable fetch); never invent http_status without a response
 * - On live 404/not_found → searchable replacement (injectable search), then GET
 * - non-URL claim → verdict unaudited (not found); no fabricated sources
 *
 * Billing honesty:
 * - Golden briefs billable only at GOLDEN_BRIEF_AUTHORED_DEPTH (standard);
 *   other depths on the same frozen body → billable=false (price≠work).
 * - Live lookup billable only with ask-aligned excerpt + publisher + page date.
 */

import { createHash } from "node:crypto";
import {
  AS_OF,
  GOLDEN_BRIEF_AUTHORED_DEPTH,
  type CompareOptionsResult,
  type Depth,
  type FetchFn,
  type ResearchBriefResult,
  type SearchFn,
  type SourceLookupResult,
} from "../types.js";
import {
  goldenBriefHappy,
  goldenBriefSparse,
  goldenCompareHappy,
  goldenCompareMissing,
  goldenLookupConflicting,
  goldenLookupFound,
  goldenLookupNotFound,
  goldenNicheBriefAgentsApi,
  goldenNicheBriefAnnotations,
  goldenNicheLookupTokenPassthrough,
} from "./goldens.js";

const LOOKUP_TIMEOUT_MS = 8000;
/** Paid lookup bar: excerpt must be at least this long AND ask-aligned + dated */
const LOOKUP_EXCERPT_MIN = 80;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAll(hay: string, needles: string[]): boolean {
  const h = norm(hay);
  return needles.every((n) => h.includes(norm(n)));
}

function hostname(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "unknown";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSnippet(bodyText: string, ask: string, maxLen = 280): string {
  const text = bodyText.slice(0, 50_000);
  const askWords = ask
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);
  let idx = 0;
  for (const w of askWords) {
    const i = text.toLowerCase().indexOf(w);
    if (i >= 0) {
      idx = Math.max(0, i - 40);
      break;
    }
  }
  const slice = text.slice(idx, idx + maxLen).trim();
  return slice.length > 0 ? slice : text.slice(0, maxLen).trim();
}

/** Ask-aligned: enough meaningful ask tokens appear in the excerpt/text. */
function isAskAligned(text: string, ask: string): boolean {
  const words = ask
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return text.trim().length >= LOOKUP_EXCERPT_MIN;
  const lower = text.toLowerCase();
  const hits = words.filter((w) => lower.includes(w)).length;
  const need = Math.min(2, words.length);
  return hits >= need;
}

/** Detect a page date (ISO or Month DD, YYYY) in extracted text. */
export function extractPageDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;
  const named = text.match(
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/i,
  );
  if (named) return named[1]!;
  return null;
}

/**
 * Paid lookup quality bar (raised beyond 80-char alone):
 * usable excerpt + ask-aligned quote + publisher identity + page date.
 */
export function lookupBarPassing(opts: {
  excerpt: string;
  ask: string;
  url: string;
  bodyText: string;
}): boolean {
  const { excerpt, ask, url, bodyText } = opts;
  if (excerpt.length < LOOKUP_EXCERPT_MIN) return false;
  if (!isAskAligned(excerpt, ask) && !isAskAligned(bodyText, ask)) return false;
  if (hostname(url) === "unknown") return false;
  if (!extractPageDate(bodyText)) return false;
  return true;
}

/**
 * Apply golden-brief billing honesty.
 * Choice (documented): goldens bill only for the depth they were authored for
 * (GOLDEN_BRIEF_AUTHORED_DEPTH = standard). Caller depth quick/deep on the same
 * frozen body → meta.billable=false with a gap noting price≠work.
 */
function attachGoldenBriefMeta(
  fixture: ResearchBriefResult,
  callerDepth: Depth,
  query: string,
): ResearchBriefResult {
  const authored = GOLDEN_BRIEF_AUTHORED_DEPTH;
  const depthOk = callerDepth === authored;
  const gaps = [...fixture.gaps];
  if (!depthOk) {
    gaps.push(
      `Golden fixture authored for depth=${authored}; caller depth=${callerDepth} — price≠work on unchanged body, not billed (billable=false).`,
    );
  }
  return {
    ...fixture,
    depth: callerDepth,
    query,
    gaps,
    meta: { mode: "golden", billable: depthOk },
  };
}

function matchBriefGolden(query: string): ResearchBriefResult | null {
  const q = query;
  if (
    includesAll(q, ["model context protocol"]) &&
    (includesAll(q, ["who created"]) || includesAll(q, ["who maintains"]))
  ) {
    return goldenBriefHappy();
  }
  if (includesAll(q, ["smithery"]) && includesAll(q, ["hobby"])) {
    return goldenBriefSparse();
  }
  if (
    includesAll(q, ["annotation"]) &&
    (includesAll(q, ["readOnlyHint"]) ||
      includesAll(q, ["readonlyhint"]) ||
      includesAll(q, ["trust"]))
  ) {
    return goldenNicheBriefAnnotations();
  }
  if (includesAll(q, ["agents api"]) && includesAll(q, ["mcp"])) {
    return goldenNicheBriefAgentsApi();
  }
  return null;
}

function matchCompareGolden(input: {
  options: string[];
  question: string;
}): CompareOptionsResult | null {
  const opts = input.options.map(norm);
  const q = input.question;
  if (
    opts.includes("mcp") &&
    opts.includes("a2a") &&
    (includesAll(q, ["research tools"]) || includesAll(q, ["expose"]))
  ) {
    return goldenCompareHappy();
  }
  if (
    opts.some((o) => o.includes("smithery")) &&
    opts.some((o) => o.includes("registry") || o.includes("official"))
  ) {
    return goldenCompareMissing();
  }
  return null;
}

function matchLookupGolden(claim: string): SourceLookupResult | null {
  const c = claim;
  if (includesAll(c, ["anthropic.com/news/model-context-protocol"])) {
    return goldenLookupFound();
  }
  if (includesAll(c, ["specification/2019-01-01"])) {
    return goldenLookupNotFound();
  }
  if (includesAll(c, ["150"]) && includesAll(c, ["a2a"])) {
    return goldenLookupConflicting();
  }
  if (
    includesAll(c, ["token passthrough"]) ||
    (includesAll(c, ["token"]) && includesAll(c, ["passthrough"]))
  ) {
    return goldenNicheLookupTokenPassthrough();
  }
  return null;
}

/** True when the path can still bill (full SKU precheck warranted). */
export function briefPathMayBeBillable(query: string, depth: Depth): boolean {
  const g = matchBriefGolden(query);
  if (!g) return false;
  return depth === GOLDEN_BRIEF_AUTHORED_DEPTH;
}

export function comparePathMayBeBillable(
  options: string[],
  question: string,
): boolean {
  return matchCompareGolden({ options, question }) !== null;
}

export function lookupPathMayBeBillable(claimOrUrl: string): boolean {
  if (matchLookupGolden(claimOrUrl)) return true;
  return /^https?:\/\//i.test(claimOrUrl.trim());
}

export function resolveBrief(input: {
  query: string;
  depth: Depth;
  as_of_hint?: string;
}): ResearchBriefResult {
  const matched = matchBriefGolden(input.query);
  if (matched) {
    return attachGoldenBriefMeta(matched, input.depth, input.query);
  }
  return genericBrief(input);
}

export function resolveCompare(input: {
  options: string[];
  question: string;
  criteria: string[];
}): CompareOptionsResult {
  const matched = matchCompareGolden(input);
  if (matched) {
    return {
      ...matched,
      options: input.options,
      question: input.question,
      criteria: input.criteria.length ? input.criteria : matched.criteria,
      meta: { mode: "golden", billable: true },
    };
  }
  return genericCompare(input);
}

export async function resolveLookup(
  input: {
    claim_or_url: string;
    ask: string;
  },
  opts?: { fetch?: FetchFn; search?: SearchFn },
): Promise<SourceLookupResult> {
  const c = input.claim_or_url;
  const ask = input.ask;

  const matched = matchLookupGolden(c);
  if (matched) {
    return {
      ...matched,
      claim_or_url: c,
      ask,
      meta: { mode: "golden", billable: true },
    };
  }

  return genericLookup(input, opts?.fetch ?? globalThis.fetch, opts?.search);
}

function seed(s: string): number {
  const h = createHash("sha256").update(s).digest();
  return h.readUInt32BE(0);
}

function genericBrief(input: {
  query: string;
  depth: Depth;
  as_of_hint?: string;
}): ResearchBriefResult {
  const n = seed(input.query + input.depth);
  const deep = input.depth === "deep";
  const quick = input.depth === "quick";

  const baseSources = [
    {
      title: "MCP Specification 2026-07-28 (fixture-set anchor)",
      url: "https://modelcontextprotocol.io/specification/2026-07-28",
      publisher: "modelcontextprotocol.io",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
    {
      title: "Introducing the Model Context Protocol (fixture-set anchor)",
      url: "https://www.anthropic.com/news/model-context-protocol",
      publisher: "Anthropic",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
    {
      title: "A2A Protocol Specification (fixture-set anchor)",
      url: "https://a2a-protocol.org/latest/specification/",
      publisher: "a2a-protocol.org",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
    {
      title: "Linux Foundation — Agentic AI Foundation (fixture-set anchor)",
      url: "https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation",
      publisher: "Linux Foundation",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
  ];

  const extraDeep = [
    {
      title: "MCP Security Best Practices (fixture-set anchor)",
      url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices",
      publisher: "modelcontextprotocol.io",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
    {
      title: "Agents API overview (fixture-set anchor)",
      url: "https://developers.openai.com/api/docs/guides/agents-api/overview",
      publisher: "developers.openai.com",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
    {
      title: "modelcontextprotocol GitHub (fixture-set anchor)",
      url: "https://github.com/modelcontextprotocol/modelcontextprotocol",
      publisher: "GitHub",
      accessed: AS_OF,
      type: "primary" as const,
      supports:
        "Sample-only fixture-set anchor — not fetched for this caller query",
    },
  ];

  const sources = quick
    ? baseSources.slice(0, 2)
    : deep
      ? [...baseSources, ...extraDeep]
      : baseSources;

  return {
    query: input.query,
    depth: input.depth,
    tldr: `Sample brief for “${input.query.slice(0, 120)}” (depth=${input.depth}). Demo/sample only — not charged as research. Uses fixture-set anchors from the frozen 2026-09-12 set; those URLs were not fetched for this caller query.`,
    body: {
      mode: "sample",
      billable: false,
      seed: n,
      sections: {
        what: "Topic framed against MCP / agent-interop fixture-set anchors (sample-only).",
        status:
          "No live search in sample mode; LIVE_RESEARCH=1 enables optional shallow/quick live path. Not charged as research.",
        implications: "Prefer primary docs over roundup blogs for high confidence.",
      },
      ...(deep
        ? {
            counter_arguments: [
              "Marketing adoption counts without a roster should stay medium/unknown.",
              "Host APIs that speak MCP are callers, not substitutes for exposing a server.",
            ],
          }
        : {}),
    },
    confidence: "medium",
    sources,
    gaps: [
      "Sample/demo path — not charged as research (billable=false).",
      "Fixture-set MCP/A2A URLs are anchors only; they were not fetched for this caller query.",
      "Enable LIVE_RESEARCH=1 for depth=quick live attempt, or supply a golden fixture.",
      ...(input.as_of_hint
        ? [`Caller as_of_hint=${input.as_of_hint}; sample fixtures frozen at ${AS_OF}.`]
        : []),
    ],
    as_of: AS_OF,
    meta: { mode: "sample", billable: false },
  };
}

function genericCompare(input: {
  options: string[];
  question: string;
  criteria: string[];
}): CompareOptionsResult {
  const criteria = input.criteria.length
    ? input.criteria
    : ["purpose", "governance", "maturity"];

  const table = criteria.map((criterion) => {
    const row: Record<string, string> = { criterion };
    for (const opt of input.options) {
      row[opt] =
        criterion.toLowerCase().includes("take_rate") ||
        criterion.toLowerCase().includes("price") ||
        criterion.toLowerCase().includes("pricing")
          ? "unknown"
          : `Sample cell for ${opt} / ${criterion} — verify on first-party docs before deciding.`;
    }
    row.winner_if = `If you care about ${criterion}, re-fetch primaries per option; sample path does not invent stats.`;
    return row;
  });

  const sources = input.options.flatMap((opt, i) => [
    {
      title: `Fixture-set anchor for option: ${opt}`,
      url:
        i % 2 === 0
          ? "https://modelcontextprotocol.io/specification/2026-07-28"
          : "https://a2a-protocol.org/latest/specification/",
      publisher: i % 2 === 0 ? "modelcontextprotocol.io" : "a2a-protocol.org",
      accessed: AS_OF,
      type: "primary" as const,
      supports: `Sample-only fixture-set anchor for “${opt}” — not fetched for this caller query`,
    },
    {
      title: `Second fixture-set anchor for ${opt}`,
      url:
        i % 2 === 0
          ? "https://www.anthropic.com/news/model-context-protocol"
          : "https://github.com/a2aproject/A2A",
      publisher: i % 2 === 0 ? "Anthropic" : "GitHub / a2aproject",
      accessed: AS_OF,
      type: "primary" as const,
      supports: `Sample-only fixture-set anchor for “${opt}” — not fetched for this caller query`,
    },
  ]);

  return {
    options: input.options,
    question: input.question,
    criteria,
    tldr: `Sample comparison for [${input.options.join(", ")}]. Demo/sample only — not charged as research. Conditional recommendation only; pricing/take-rate cells stay unknown without first-party terms.`,
    body: {
      mode: "sample",
      billable: false,
      table,
      recommendation: {
        overall:
          "Use the option that matches your job-to-be-done; do not invent take rates or list prices.",
        conditional: input.options.map(
          (o) => `If ${o} is already where your callers browse, list/expose there first.`,
        ),
      },
    },
    confidence: "low",
    sources,
    gaps: [
      "Sample/demo path — not charged as research (billable=false).",
      "Fixture-set MCP/A2A URLs are anchors only; they were not fetched for this caller query.",
      "Sample compare did not fetch option-specific marketplace terms.",
      "Any take_rate / USD price criterion remains unknown until first-party terms are fetched.",
    ],
    as_of: AS_OF,
    meta: { mode: "sample", billable: false },
  };
}

async function genericLookup(
  input: { claim_or_url: string; ask: string },
  fetchFn: FetchFn,
  searchFn?: SearchFn,
): Promise<SourceLookupResult> {
  const trimmed = input.claim_or_url.trim();
  const looksUrl = /^https?:\/\//i.test(trimmed);

  if (!looksUrl) {
    return {
      claim_or_url: input.claim_or_url,
      ask: input.ask,
      verdict: "unaudited",
      http_status: null,
      tldr: `Claim was not live-fetched or searched. Verdict is unaudited — not found. A live fetch/search is required before treating this as verified.`,
      body: {
        mode: "sample",
        billable: false,
        ask: input.ask,
        note: "Off-golden non-URL claims are never returned as found without a live audit.",
      },
      confidence: "unknown",
      sources: [],
      gaps: [
        "Live fetch/search required to audit this claim; no fabricated sources attached.",
        "Sample/demo path — not charged as research (billable=false).",
      ],
      as_of: AS_OF,
      meta: { mode: "sample", billable: false },
    };
  }

  return liveFetchLookup(trimmed, input.ask, fetchFn, searchFn);
}

/** Default DuckDuckGo HTML search (uses injectable fetch). */
export async function defaultLookupSearch(
  query: string,
  fetchFn: FetchFn,
): Promise<string[]> {
  try {
    const q = encodeURIComponent(query.slice(0, 200));
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
    const res = await fetchFn(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { "user-agent": "research-mcp/0.1 (+source-lookup-search)" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const urls: string[] = [];
    const linkRe =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null && urls.length < 4) {
      const href = decodeDuckRedirect(m[1]!);
      if (href.startsWith("http") && !urls.includes(href)) urls.push(href);
    }
    return urls;
  } catch {
    return [];
  }
}

function decodeDuckRedirect(href: string): string {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

async function getOnce(
  url: string,
  fetchFn: FetchFn,
): Promise<{ status: number; bodyText: string } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "research-mcp/0.1 (+source-lookup)" },
    });
    clearTimeout(timer);
    let bodyText = "";
    try {
      const raw = await res.text();
      bodyText = stripHtml(raw);
    } catch {
      bodyText = "";
    }
    return { status: res.status, bodyText };
  } catch (err) {
    clearTimeout(timer);
    const reason =
      err instanceof Error
        ? err.name === "AbortError"
          ? "timeout"
          : err.message || "network error"
        : "network error";
    return { error: reason };
  }
}

function foundFromBody(
  url: string,
  ask: string,
  status: number,
  bodyText: string,
  opts?: { verdict?: "found" | "moved"; priorUrl?: string; searched?: boolean },
): SourceLookupResult {
  const snippet = bodyText ? extractSnippet(bodyText, ask) : "";
  const pageDate = extractPageDate(bodyText);
  const publisher = hostname(url);
  const barPassing = lookupBarPassing({
    excerpt: snippet,
    ask,
    url,
    bodyText,
  });
  const hasContent = snippet.length >= LOOKUP_EXCERPT_MIN;
  const confidence = barPassing ? "medium" : hasContent ? "low" : "low";
  const verdict = opts?.verdict ?? "found";
  const gaps: string[] = [];
  if (!hasContent) {
    gaps.push("Response body yielded little text; re-fetch or try another primary.");
  } else if (!barPassing) {
    if (!isAskAligned(snippet, ask) && !isAskAligned(bodyText, ask)) {
      gaps.push("Excerpt not ask-aligned — not charged as research.");
    }
    if (!pageDate) {
      gaps.push("No page date detected — paid lookup bar requires publisher/date.");
    }
    gaps.push(
      "Paid lookup bar requires ask-aligned quote + publisher + page date (80 chars alone is not enough).",
    );
  }

  return {
    claim_or_url: opts?.priorUrl ?? url,
    ask,
    verdict,
    http_status: status,
    tldr:
      verdict === "moved"
        ? `Original URL missed; replacement GET ${status} at ${url}.`
        : hasContent
          ? `Live GET ${status} for ${url}. Short excerpt extracted from page text (paraphrase/quote candidate).`
          : `Live GET ${status} for ${url}, but little extractable text; treat confidence as low.`,
    body: {
      mode: "live",
      ask,
      fetched: true,
      excerpt: snippet || null,
      page_date: pageDate,
      publisher,
      ...(opts?.priorUrl
        ? { original_url: opts.priorUrl, replacement_url: url }
        : {}),
      ...(opts?.searched ? { replacement_search: true } : {}),
      paraphrase: snippet
        ? `Page text near ask keywords: “${snippet.slice(0, 200)}${snippet.length > 200 ? "…" : ""}”`
        : null,
      billable: barPassing,
    },
    confidence,
    sources: [
      {
        title: `GET ${url}`,
        url,
        publisher,
        accessed: AS_OF,
        type: "primary",
        supports: hasContent
          ? `Live GET ${status}; excerpt supports ask: ${snippet.slice(0, 120)}`
          : `Live GET ${status}; body had little extractable text`,
      },
    ],
    gaps,
    as_of: AS_OF,
    meta: { mode: "live", billable: barPassing },
  };
}

async function liveFetchLookup(
  url: string,
  ask: string,
  fetchFn: FetchFn,
  searchFn?: SearchFn,
): Promise<SourceLookupResult> {
  const first = await getOnce(url, fetchFn);

  if ("error" in first) {
    return {
      claim_or_url: url,
      ask,
      verdict: "blocked",
      http_status: null,
      tldr: `Live GET failed for ${url} (${first.error}). No HTTP status recorded.`,
      body: {
        mode: "live",
        ask,
        fetched: true,
        fetch_error: first.error,
      },
      confidence: "unknown",
      sources: [
        {
          title: `GET ${url} (failed)`,
          url,
          publisher: hostname(url),
          accessed: AS_OF,
          type: "primary",
          supports: `Live GET did not complete (${first.error}); http_status left null`,
        },
      ],
      gaps: [
        `Fetch failed (${first.error}); live retry or alternate URL required.`,
        "No http_status invented — no HTTP response was received.",
      ],
      as_of: AS_OF,
      meta: { mode: "live", billable: false },
    };
  }

  const { status, bodyText } = first;

  if (status === 404) {
    return lookupMissWithReplacement(url, ask, fetchFn, searchFn);
  }

  if (status === 403) {
    return {
      claim_or_url: url,
      ask,
      verdict: "blocked",
      http_status: 403,
      tldr: `Live GET returned HTTP 403 Forbidden for ${url} — blocked, not proof the resource does not exist.`,
      body: {
        mode: "live",
        ask,
        fetched: true,
        note: "403 means access blocked; do not equate with not_found.",
      },
      confidence: "high",
      sources: [
        {
          title: `GET ${url}`,
          url,
          publisher: hostname(url),
          accessed: AS_OF,
          type: "primary",
          supports: "Live GET returned 403 Forbidden (blocked)",
        },
      ],
      gaps: [
        "Access blocked (403). Retry with different credentials/agent or use an alternate primary URL.",
      ],
      as_of: AS_OF,
      meta: { mode: "live", billable: false },
    };
  }

  if (status >= 200 && status < 300) {
    return foundFromBody(url, ask, status, bodyText);
  }

  return {
    claim_or_url: url,
    ask,
    verdict: status >= 400 ? "blocked" : "not_found",
    http_status: status,
    tldr: `Live GET returned HTTP ${status} for ${url}.`,
    body: { mode: "live", ask, fetched: true },
    confidence: "unknown",
    sources: [
      {
        title: `GET ${url}`,
        url,
        publisher: hostname(url),
        accessed: AS_OF,
        type: "primary",
        supports: `Live GET returned HTTP ${status}`,
      },
    ],
    gaps: [`Unexpected HTTP status ${status} from live fetch.`],
    as_of: AS_OF,
    meta: { mode: "live", billable: false },
  };
}

/**
 * On live 404: search for a replacement URL, then GET that.
 * Does not invent status. Network errors on replacement stay blocked/null.
 */
async function lookupMissWithReplacement(
  url: string,
  ask: string,
  fetchFn: FetchFn,
  searchFn?: SearchFn,
): Promise<SourceLookupResult> {
  const search =
    searchFn ?? ((q: string) => defaultLookupSearch(q, fetchFn));
  const searchQuery = `${ask} site:${hostname(url)}`;
  let candidates: string[] = [];
  let searchError: string | null = null;
  try {
    candidates = await search(searchQuery);
  } catch (err) {
    searchError = err instanceof Error ? err.message : "search error";
  }

  for (const alt of candidates) {
    if (!alt || alt === url || !/^https?:\/\//i.test(alt)) continue;
    const altRes = await getOnce(alt, fetchFn);
    if ("error" in altRes) {
      // Network error on replacement — do not invent status; keep looking
      continue;
    }
    if (altRes.status >= 200 && altRes.status < 300) {
      return foundFromBody(alt, ask, altRes.status, altRes.bodyText, {
        verdict: "moved",
        priorUrl: url,
        searched: true,
      });
    }
  }

  return {
    claim_or_url: url,
    ask,
    verdict: "not_found",
    http_status: 404,
    tldr: `Live GET returned HTTP 404 for ${url}. Replacement search did not yield a usable page.`,
    body: {
      mode: "live",
      ask,
      fetched: true,
      note: "Status recorded from the live response only.",
      replacement_search: true,
      replacement_candidates: candidates.length,
      ...(searchError ? { search_error: searchError } : {}),
    },
    confidence: "high",
    sources: [
      {
        title: `GET ${url}`,
        url,
        publisher: hostname(url),
        accessed: AS_OF,
        type: "primary",
        supports: "Live GET returned 404 Not Found",
      },
    ],
    gaps: [
      "Page does not exist at this URL (live 404).",
      candidates.length === 0
        ? "Replacement search returned no candidate URLs."
        : "Replacement candidates were fetched but none returned a usable 2xx page.",
    ],
    as_of: AS_OF,
    meta: { mode: "live", billable: false },
  };
}
