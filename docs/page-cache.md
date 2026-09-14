# Honest page-body cache (P4)

Cache extracted page bodies to improve margin without weakening the charge gate.

## Contract

| Field | Role |
|---|---|
| URL | Cache key |
| content hash (sha256 of text) | Stored with entry; integrity / debug |
| `as_of` | Must match server `AS_OF`; mismatch → miss |
| volatility TTL | `PAGE_CACHE_TTL_MS` (default 1h); `0` disables |

Provenance is always labeled:

- Each live-pipeline `sources[]` entry has `source: "cached" | "live"`
- Body `extracted[]` and `page_cache` / `cogs.cache_hits` mirror the same

## Bypass (force live)

Cache is skipped when any of:

- Caller passes `as_of_hint` (freshness ask)
- `forceLive: true` on the pipeline opts
- `PAGE_CACHE_BYPASS=1` or `FORCE_LIVE=1`
- `PAGE_CACHE_TTL_MS=0`

Charge gate is unchanged: `billable` still requires density + quotesVerified +
query-tie + `source_url`. Cache hits do not unlock billing.

## Follow-up (not in this commit)

`resources://run/{id}/source/{n}` with short `ttlMs` / private `cacheScope`
(don’t dump full copyrighted pages) is deferred — per-request MCP factory
makes durable run-scoped Resources non-cheap. Track separately.

## Related

- `src/research/page-cache.ts`
- optimization-brief.md #5
