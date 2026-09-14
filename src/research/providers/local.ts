/**
 * Default LIVE_RESEARCH provider: DuckDuckGo HTML search + HTTP extract.
 * No Parallel / Exa / Tavily. Injectable fetch for tests.
 */

import type { FetchFn } from "../../types.js";
import { defaultLookupSearch, extractPageDate } from "../samples.js";
import type {
  ExtractedPage,
  ProviderCallOpts,
  ResearchProvider,
} from "./types.js";

const TIMEOUT_MS = 8000;
const MAX_TEXT = 50_000;

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

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) return m[1].replace(/\s+/g, " ").trim().slice(0, 200);
  return "";
}

/** Merge caller abort with a timeout abort. */
function combinedSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuter = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) {
      clearTimeout(timer);
      ctrl.abort();
    } else {
      outer.addEventListener("abort", onOuter, { once: true });
    }
  }
  return {
    signal: ctrl.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (outer) outer.removeEventListener("abort", onOuter);
    },
  };
}

export class LocalHttpProvider implements ResearchProvider {
  readonly id = "local-http";
  constructor(private fetchFn: FetchFn = globalThis.fetch) {}

  async search(query: string, opts?: ProviderCallOpts): Promise<string[]> {
    if (opts?.signal?.aborted) {
      const err = new Error("search aborted");
      err.name = "AbortError";
      throw err;
    }
    // defaultLookupSearch does not yet take a signal; honor pre-abort only.
    return defaultLookupSearch(query, this.fetchFn);
  }

  async fetchExtract(
    url: string,
    opts?: ProviderCallOpts,
  ): Promise<ExtractedPage> {
    const { signal, cleanup } = combinedSignal(opts?.signal, TIMEOUT_MS);
    try {
      const res = await this.fetchFn(url, {
        method: "GET",
        signal,
        redirect: "follow",
        headers: { "user-agent": "research-mcp/0.1 (+live-brief-extract)" },
      });
      if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
      }
      const html = await res.text();
      const title = extractTitle(html);
      const text = stripHtml(html).slice(0, MAX_TEXT);
      if (!text) throw new Error(`GET ${url} yielded no extractable text`);
      return {
        url,
        text,
        title: title || hostname(url),
        publisher: hostname(url),
        date: extractPageDate(text) ?? undefined,
        fetch_source: "live",
      };
    } finally {
      cleanup();
    }
  }
}
