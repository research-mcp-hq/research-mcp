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
npm run eval:all  # goldens + off-golden + pipeline
npm run test:pipeline  # mock live brief + COGS caps
```

## Env vars

| Var | Required | Description |
| --- | --- | --- |
| `API_KEYS` | yes (for `/mcp`) | Comma-separated API keys |
| `PORT` | no | Default `3000` |
| `HOST` | no | Default `0.0.0.0` |
| `LIVE_RESEARCH` | no | Set `1` to run search→extract→synthesize for `research_brief` `quick`/`standard` (COGS-capped; sample fallback) |
| `COGS_CAP_CENTS_*` | no | Hard COGS caps per SKU (defaults 10 / 25 / 50). Over-cap → `billable=false` |
| `PARALLEL_API_KEY` / `EXA_API_KEY` | no | Placeholders — **unused** until keys are provided |

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

When `LIVE_RESEARCH=1`, off-golden `research_brief` with `depth=quick` or `standard` runs search → fetch/extract (page cap) → local extractive synthesizer. **Extractive v0 never bills** (`meta.billable=false`; quote gate required). Soft-reserve skips full SKU precheck on this path. COGS over-cap still aborts fail-closed. Failure falls back to sample. Deep stays sample in this phase. Tests inject `MockProvider` (no network). Parallel/Exa are not called.

## Metering stub

Each tool call logs a JSON line to stdout (`type: usage`) with `requestId`, `tool`, `keyId`, `latencyMs`, `estimatedTokens`, `estimatedCostUsd`, `timestamp`. Prepaid rate stubs: Lite/lookup **$0.25**, Standard **$0.60**, Deep **$1.50** (see `pricing-addendum.md`).

## Layout

- `src/index.ts` — Express + auth + `/health` + `/mcp`
- `src/server.ts` — MCP tool registration
- `src/research/` — samples, goldens, live pipeline + providers
- `evals/score-goldens.ts` — 6/6 rubric
- `docs/TOOLS.md` — schemas
- `ARCHITECTURE.md` — transport / auth / metering

## Ops

Verify / push prep: see [RUNBOOK.md](./RUNBOOK.md).
