# Architecture — research-mcp

Short map of the v0 remote MCP server.

## Transport

- **Streamable HTTP** via MCP TypeScript SDK v2:
  - `@modelcontextprotocol/server` — `McpServer`, `createMcpHandler` (per-request, stateless)
  - `@modelcontextprotocol/express` — `createMcpExpressApp` (JSON body + host/origin guards)
  - `@modelcontextprotocol/node` — `toNodeHandler` adapts the web handler to Express
- Endpoint: `POST|GET|DELETE /mcp` (clients use streamable HTTP / SSE as negotiated)
- Health: `GET /health` → `{ status, version }` (unauthenticated)

> Note: the classic monolith `@modelcontextprotocol/sdk` was split into these packages in SDK v2. This repo follows the current recommended Express + streamable HTTP pattern.

## Auth

- Required on `/mcp`: `Authorization: Bearer <key>` **or** `X-API-Key: <key>`
- Keys from env `API_KEYS` (comma-separated)
- Missing/invalid → **401**; empty `API_KEYS` → **500** misconfigured
- `/health` is open

## Tools

| Tool | Job |
| --- | --- |
| `research_brief` | Decision-ready brief (`query`, `depth`: quick\|standard\|deep, optional `as_of_hint`) |
| `compare_options` | Criteria table + conditional rec (`options`, `question`, `criteria`) |
| `source_lookup` | Resolve claim/URL (`claim_or_url`, `ask`) + `verdict` / `http_status` |

All tools share the research envelope: `tldr`, `body`, `confidence`, `sources[]`, `gaps[]`, `as_of`, optional `meta: { mode, billable }`.

Annotations (hints only — hosts must not treat as a sandbox):

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: true`
- `idempotentHint: true`

## Behavior

- **Default:** high-quality **sample** responses. Golden fixtures in `src/research/goldens.ts` match `quality-bars.md` + `niche-goldens.md`.
- **Off-golden `source_lookup`:** async real GET for `https?://` URLs (injectable `fetch`, ~8s timeout). Never invent `http_status`. Non-URL claims → `verdict: unaudited`.
- **Off-golden brief/compare:** `mode=sample`, fixture-set anchors labeled sample-only, **not charged**.
- **Optional live brief:** `LIVE_RESEARCH=1` → `research_brief` with `depth=quick` may attempt DuckDuckGo HTML snippets; falls back to sample on failure. Snippet-only → `billable=false`.

## Metering stub + charge gate

`UsageLogger` (`src/usage.ts`) writes one JSON line per tool call to stdout:

`requestId`, `tool`, `keyId` (last4), `latencyMs`, `estimatedTokens`, `estimatedCostUsd`, `charge_usd`, `billable`, `mode`, `timestamp`

Charge only when:

1. **Golden-matched** (`meta.mode=golden`, `billable=true`), or
2. **Live-fetched and quality-bar-passing** (`meta.mode=live`, `billable=true`)

Otherwise `estimatedCostUsd: 0`, `charge_usd: 0`, `billable: false` (sample/demo path, quality-bar fail, snippet-only live).

Estimated USD aligns to prepaid SKU stubs in `pricing-addendum.md` (Lite $0.25 / Standard $0.60 / Deep $1.50) when billable. Stripe / x402 can replace the logger later — no marketplace in v0.

## Eval

- `npm run eval` — goldens on the 6-point ship rubric (no fabrication, density, confidence legal, must-include, must-not, honest gaps). Expect 10/10.
- `npm run eval:off` — off-golden cases (mocked fetch): no invented 404/`found`, 403→blocked, sample billable=false.
- `npm run eval:all` — both stages.
