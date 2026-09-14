# research-mcp

Paid **cited research** remote MCP for coding / research agents (API key auth, not OAuth).

**Why pay:** query-tied excerpt packs from allowlisted primaries; **refuse uncited** — that call is **$0**. Prepaid packs; meters only on billable successes.

> Repo may be private; treat this README as the agent-facing contract. Live Fly host is unchanged.

## MCP URL (production)

```
https://research-mcp-mhh.fly.dev/mcp
```

Health: `https://research-mcp-mhh.fly.dev/health`  
Server card: `https://research-mcp-mhh.fly.dev/.well-known/mcp/server-card.json`  
Credits meter: `GET https://research-mcp-mhh.fly.dev/billing/credits` (auth’d)

```json
{
  "mcpServers": {
    "research-mcp": {
      "url": "https://research-mcp-mhh.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Auth

Every `/mcp` and `/billing/credits` request:

- `Authorization: Bearer <key>` **or**
- `X-API-Key: <key>`

Keys: prepaid customer key (from Checkout success page) **or** break-glass `API_KEYS` (ops; no ledger debit).

## Pricing (locked)

| Pack | Credits |
| --- | --- |
| **$10** starter | 1000¢ |
| **$25** standard | 2500¢ |
| **$50** pro | 5000¢ |

| Meter (billable success) | Price |
| --- | --- |
| lite (`source_lookup`, `research_brief` depth=quick) | **$0.25** |
| standard (`research_brief` depth=standard) | **$0.60** |
| deep (preview only) | **$1.50** published meter; preview path always **$0** |

**fail = $0:** sample/demo, quote-gate fail, density fail, COGS abort, cancel, depth-mismatched golden, preview/parked paths (`meta.billable=false`, `charge_usd=0`).

Inspect balance + tables: `GET /billing/credits` → `balance_cents`, `packs`, `meters_usd`, `fail_usd: 0`. Break-glass returns `{ break_glass: true, balance_cents: null }` (no fake balance).

## When to call each tool

### Live (default paid surface)

| Tool | Call when | Do not |
| --- | --- | --- |
| **`research_brief`** | You need cited, query-tied excerpt packs on AI infra / MCP / security. `depth=quick` ($0.25) or `depth=standard` ($0.60). | Do not use `depth=deep` (parked / sample only unless preview flag). |
| **`source_lookup`** | You have **one** URL or claim to fetch/verify. Lite $0.25. | Do not use as open-web search or multi-source synthesis. |

Both return the shared envelope: `tldr`, `body`, `confidence`, `sources`, `gaps`, `as_of`, plus `schema_version` (`2026-09-14`). Optional `fail_gate: { reason, retryable }`, `claims` / excerpts, `retrieved_at`. If quotes fail verification on `source_url`, the run is **refused and not billed**.

### Preview / parked (`ENABLE_PREVIEW_TOOLS=1`)

| Tool / path | Behavior |
| --- | --- |
| **`compare_options`** | Registered only with the flag. **Always $0** / `billable=false`. No live path — prefer `research_brief`. |
| **`depth=deep`** | Allowed only with the flag. **Always $0**. Soft-reserve never demands full deep SKU. |

Without the flag: `compare_options` is **not** registered; `depth=deep` is rejected (`preview_required`). Directory card still says do-not-call for compare/deep.

**No stub billing. No 25-tool kitchen sink** — two live tools by default.

## Published contract

- Schema: [`docs/contract/schema.json`](./docs/contract/schema.json)
- Examples: [`docs/contract/examples/happy-research-brief.json`](./docs/contract/examples/happy-research-brief.json), [`fail-gate.json`](./docs/contract/examples/fail-gate.json)
- HTTP header on responses: `X-Research-MCP-Schema-Version: 2026-09-14`
- Tool notes: [`docs/TOOLS.md`](./docs/TOOLS.md)

## Quickstart (local)

```bash
cd /workspace/research-mcp
npm install && npm run build
API_KEYS=dev-key-1 npm start
# optional live brief path:
LIVE_RESEARCH=1 API_KEYS=dev-key-1 npm start
```

```bash
curl -s http://127.0.0.1:3000/health
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer dev-key-1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Env (high-signal)

| Var | Notes |
| --- | --- |
| `API_KEYS` | Break-glass keys (comma-separated) |
| `LIVE_RESEARCH=1` | Live search→extract→synthesize→quote gate for quick/standard |
| `ENABLE_PREVIEW_TOOLS=1` | Register compare + allow deep (always $0) |
| `DATABASE_URL` | SQLite ledger for customer keys / credits |
| Stripe `STRIPE_*` / pack price IDs | Prepaid Checkout (test until go-live) |

## Tests

```bash
npm run eval:all      # goldens + off-golden + pipeline
npm run test:billing  # ledger / webhook / credits meter
```

## Layout

- `src/server.ts` — tool registration (finish-or-hide)
- `src/billing/credits.ts` — `GET /billing/credits` (T10 visible meter)
- `src/contract.ts` — `schema_version` + `fail_gate`
- `docs/contract/` — published JSON Schema + examples
- `ARCHITECTURE.md` — transport / auth / metering

## Discovery

| Surface | URL / ID |
| --- | --- |
| GitHub | https://github.com/research-mcp-hq/research-mcp |
| Fly MCP | https://research-mcp-mhh.fly.dev/mcp |
| Smithery (discovery only) | https://smithery.ai/servers/research-mcp-hq/research-mcp |

Homepage for listings: **GitHub**, not Smithery.

## Ops

See [RUNBOOK.md](./RUNBOOK.md). License: [MIT](./LICENSE).
