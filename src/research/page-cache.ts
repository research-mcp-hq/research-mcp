/**
 * Honest page-body cache (optimization-brief #5 / P4).
 * Key material: URL + content hash + as_of + volatility TTL.
 * Always label provenance: source cached|live. Bypass on freshness asks.
 *
 * resources://run/{id}/source/{n} — deferred follow-up (not cheap under
 * per-request MCP factory); see docs/page-cache.md.
 */

import { createHash } from "node:crypto";
import { AS_OF } from "../types.js";
import type { ExtractedPage } from "./providers/types.js";

export type FetchProvenance = "cached" | "live";

export interface PageCacheConfig {
  /** Default TTL for cached bodies (ms). */
  ttlMs: number;
  /** When true, never read/write cache. */
  bypass: boolean;
  /** as_of stamp stored with entries (defaults to AS_OF). */
  asOf: string;
}

export interface CacheLookupResult {
  page: ExtractedPage;
  contentHash: string;
  asOf: string;
  ageMs: number;
}

interface CacheEntry {
  url: string;
  contentHash: string;
  asOf: string;
  storedAtMs: number;
  ttlMs: number;
  page: ExtractedPage;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function loadPageCacheConfig(
  env: NodeJS.ProcessEnv = process.env,
): PageCacheConfig {
  const rawTtl = env.PAGE_CACHE_TTL_MS?.trim();
  let ttlMs = 3_600_000; // 1h default volatility TTL
  if (rawTtl) {
    const n = Number.parseInt(rawTtl, 10);
    if (Number.isFinite(n) && n >= 0) ttlMs = n;
  }
  const bypass =
    env.PAGE_CACHE_BYPASS === "1" ||
    env.FORCE_LIVE === "1" ||
    env.PAGE_CACHE_TTL_MS === "0";
  return { ttlMs, bypass, asOf: AS_OF };
}

/** Freshness ask from caller → bypass cache (live extract). */
export function shouldBypassCache(
  opts: {
    asOfHint?: string;
    forceLive?: boolean;
    config?: PageCacheConfig;
  },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (opts.forceLive) return true;
  if (opts.asOfHint && opts.asOfHint.trim().length > 0) return true;
  const cfg = opts.config ?? loadPageCacheConfig(env);
  return cfg.bypass;
}

export class PageBodyCache {
  private readonly map = new Map<string, CacheEntry>();
  hits = 0;
  misses = 0;
  writes = 0;

  constructor(private readonly config: PageCacheConfig = loadPageCacheConfig()) {}

  get configSnapshot(): PageCacheConfig {
    return { ...this.config };
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
  }

  size(): number {
    return this.map.size;
  }

  get(url: string, nowMs = Date.now()): CacheLookupResult | undefined {
    if (this.config.bypass) {
      this.misses += 1;
      return undefined;
    }
    const entry = this.map.get(url);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.asOf !== this.config.asOf) {
      this.map.delete(url);
      this.misses += 1;
      return undefined;
    }
    const ageMs = nowMs - entry.storedAtMs;
    if (ageMs > entry.ttlMs) {
      this.map.delete(url);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return {
      page: {
        ...entry.page,
        fetch_source: "cached",
      },
      contentHash: entry.contentHash,
      asOf: entry.asOf,
      ageMs,
    };
  }

  set(url: string, page: ExtractedPage, nowMs = Date.now()): string {
    const hash = contentHash(page.text);
    const stored: ExtractedPage = {
      ...page,
      url: page.url || url,
      fetch_source: "live", // stored from a live fetch; reads flip to cached
    };
    this.map.set(url, {
      url,
      contentHash: hash,
      asOf: this.config.asOf,
      storedAtMs: nowMs,
      ttlMs: this.config.ttlMs,
      page: stored,
    });
    this.writes += 1;
    return hash;
  }
}

/** Process-wide default cache (tests may inject their own). */
let defaultCache: PageBodyCache | null = null;

export function getDefaultPageCache(
  env: NodeJS.ProcessEnv = process.env,
): PageBodyCache {
  if (!defaultCache) {
    defaultCache = new PageBodyCache(loadPageCacheConfig(env));
  }
  return defaultCache;
}

/** Test helper: reset singleton. */
export function resetDefaultPageCache(): void {
  defaultCache = null;
}

/**
 * Fetch-or-cache extract. Always sets page.fetch_source to cached|live.
 */
export async function extractWithCache(
  url: string,
  fetchLive: (url: string) => Promise<ExtractedPage>,
  opts: {
    cache?: PageBodyCache | null;
    bypass?: boolean;
  } = {},
): Promise<ExtractedPage> {
  const cache = opts.cache === undefined ? getDefaultPageCache() : opts.cache;
  if (!opts.bypass && cache) {
    const hit = cache.get(url);
    if (hit) return hit.page;
  }
  const page = await fetchLive(url);
  const live: ExtractedPage = {
    ...page,
    url: page.url || url,
    fetch_source: "live",
  };
  if (!opts.bypass && cache) {
    cache.set(url, live);
  }
  return live;
}
