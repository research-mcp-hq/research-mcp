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
- **Dual path:** env `API_KEYS` (break-glass, no ledger debit) **or** customer `api_keys` row (sha256 hash, `status=active`)
- Missing/invalid / revoked → **401**; empty `API_KEYS` **and** no ledger DB → **500** misconfigured
- `/health` is open; billing pages are open; `POST /billing/checkout` requires break-glass

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
- **Off-golden `source_lookup`:** async real GET for `https?://` URLs (injectable `fetch`, ~8s timeout). Never invent `http_status`. Non-URL claims → `verdict: unaudited`. On live **404**, attempt an injectable **search → GET replacement** (`verdict: moved` if 2xx). Network errors → `blocked` with `http_status: null`.
- **Off-golden compare:** `mode=sample`, fixture-set anchors labeled sample-only, **not charged**.
- **Live `research_brief` (phase 1+2):** off-golden `depth=quick|standard` runs **search → fetch/extract N pages (capped) → synthesize → quote gate** via an injectable `ResearchProvider`. Local synthesizer (`local-quoted-v1`) emits `{ claim, quote, source_url }[]` with verbatim sentences from page text. Tests use `MockProvider` (no network). Production with `LIVE_RESEARCH=1` uses `LocalHttpProvider` (DDG HTML URLs + HTTP extract). **Deep** stays sample. Pipeline failure → sample. `PARALLEL_API_KEY` / `EXA_API_KEY` are placeholders and **unused**.
- **COGS caps:** `COGS_CAP_CENTS_QUICK/STANDARD/DEEP` plus per-request unit costs. If projected spend would exceed the cap, abort fail-closed (`billable=false`, clear gap, no provider calls).
- **Quote gate (P2):** every load-bearing claim must have a quote that is a (lightly normalized) substring of some extracted page. Fail → `billable=false`, confidence `unknown`/`low`, gaps explain missing quotes. **Do not** unlock billing via synthesizer label alone (`!isExtractive` is insufficient).
- **Live brief charge gate:** `billable = densityConfidenceOk && quotesVerified`. Quality-fail, quote-fail, and COGS-abort stay `billable=false`.

## Metering + prepaid credits (path C)

Charge gate (`src/usage.ts` `applyChargeGate`):

1. **Golden-matched at authored depth** (`meta.mode=golden`, `billable=true`). Brief goldens are authored for **`standard`**; caller `quick`/`deep` on the same frozen body → `billable=false` (price≠work gap).
2. **Live-fetched and quality-bar-passing** (`meta.mode=live`, `billable=true`). Brief: density+primary allowlist **and** quote gate pass. Lookup bar: ask-aligned excerpt **and** publisher/date (80 chars alone is not enough).

Otherwise `charge_usd: 0`, `billable: false` (sample / quality-fail / quote-fail / COGS abort / depth mismatch) — **no ledger debit**.

**Precheck / soft-reserve:** full SKU credit assert runs only when the path *may* be billable (golden at matching depth, `LIVE_RESEARCH=1` quick/standard, compare golden, lookup golden or URL). Known non-billable paths soft-reserve **0**.

**Stripe Checkout** sells credit packs ($10 / $25 / $50). Webhook `checkout.session.completed` / `async_payment_succeeded` is the **sole** fulfill source (not `payment_intent.succeeded`). Ledger lives in SQLite (`DATABASE_URL=file:./data/ledger.sqlite`) via **sql.js** (pure JS; `better-sqlite3` native build unavailable on the Node 20 alpha box).

Debits (customer keys only): lite **25¢**, standard **60¢**, deep **150¢**. Break-glass `API_KEYS` skip debit (`break_glass=true`). Insufficient → MCP tool error `insufficient_credits` (+ HTTP **402** helper in `src/billing/http402.ts`).

Routes: `POST /webhooks/stripe` (raw body), `POST /billing/checkout`, `GET /billing/success|cancel`. No Customer Portal / Billing Credits / marketplace in v0.

## Eval

- `npm run eval` — goldens on the 6-point ship rubric (no fabrication, density, confidence legal, must-include, must-not, honest gaps). Expect 10/10.
- `npm run eval:off` — off-golden cases (mocked fetch): no invented 404/`found`, 403→blocked, sample billable=false.
- `npm run eval:all` — goldens + off-golden + pipeline.
- `npm run test:billing` — ledger/webhook/debit invariants (mocked Stripe; no live API).
- `npm run test:pipeline` — mock search→extract→synthesize→quote gate; billable only on verified quotes; COGS over-cap fail-closed; no vendor calls.
