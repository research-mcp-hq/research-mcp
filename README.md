# research-mcp

Paid deep research-as-a-service **remote MCP** (MVP).

Other agents call three tools — `research_brief`, `compare_options`, `source_lookup` — with API key auth and a usage-log stub for later Stripe / x402 metering.

Quality bars (ship = **6/6** on every golden): [`quality-bars.md`](./quality-bars.md), niche addendum [`niche-goldens.md`](./niche-goldens.md).

## Quickstart

```bash
cd /workspace/research-mcp
npm install
npm run build
API_KEYS=dev-key-1 npm start
```

Health:

```bash
curl -s http://127.0.0.1:3000/health
# {"status":"ok","version":"0.1.0"}
```

Dev (hot reload):

```bash
API_KEYS=dev-key-1 npm run dev
```

Evals:

```bash
npm run eval      # goldens G1–G7 + N1–N3 → 10/10 ship_bar
npm run eval:off  # off-golden lookup/sample charge-gate cases (mocked fetch)
npm run eval:all  # both
```

## Env vars

| Var | Required | Description |
| --- | --- | --- |
| `API_KEYS` | yes (for `/mcp`) | Comma-separated API keys |
| `PORT` | no | Default `3000` |
| `HOST` | no | Default `0.0.0.0` |
| `LIVE_RESEARCH` | no | Set `1` to allow live web search for `research_brief` with `depth=quick` (falls back to sample on failure) |

## Auth

Send on every MCP HTTP request:

- `Authorization: Bearer <key>` **or**
- `X-API-Key: <key>`

## Example: list tools

```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer dev-key-1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Cursor / Claude — remote MCP snippet

Point the client at streamable HTTP on port 3000:

```json
{
  "mcpServers": {
    "research-mcp": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer dev-key-1"
      }
    }
  }
}
```

(Exact client config keys vary; use the remote/HTTP MCP install path for your host.)

## Docker

```bash
docker build -t research-mcp .
docker run --rm -p 3000:3000 -e API_KEYS=dev-key-1 research-mcp
```

## Live research (optional)

When `LIVE_RESEARCH=1`, `research_brief` with `depth=quick` may attempt a simple DuckDuckGo HTML search. Any failure falls back to the sample path. Standard/deep goldens remain sample/fixture-driven in v0.

## Metering stub

Each tool call logs a JSON line to stdout (`type: usage`) with `requestId`, `tool`, `keyId`, `latencyMs`, `estimatedTokens`, `estimatedCostUsd`, `timestamp`. Prepaid rate stubs: Lite/lookup **$0.25**, Standard **$0.60**, Deep **$1.50** (see `pricing-addendum.md`).

## Layout

- `src/index.ts` — Express + auth + `/health` + `/mcp`
- `src/server.ts` — MCP tool registration
- `src/research/` — samples, goldens, optional live
- `evals/score-goldens.ts` — 6/6 rubric
- `docs/TOOLS.md` — schemas
- `ARCHITECTURE.md` — transport / auth / metering

## Ops

Verify / push prep: see [RUNBOOK.md](./RUNBOOK.md).
