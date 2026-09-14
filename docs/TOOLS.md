# Tools — agent-facing summary

**schema_version:** `2026-09-14` (also header `X-Research-MCP-Schema-Version`)  
**Full JSON Schema:** [contract/schema.json](./contract/schema.json)

## Default live tools

### `research_brief`

Call when you need cited, query-tied excerpt packs on AI infra, MCP, or security. Use `depth=quick` ($0.25) or `depth=standard` ($0.60). Returns envelope `tldr`/`body`/`confidence`/`sources`/`gaps`/`as_of` + `schema_version`. Do not call with `depth=deep` unless `ENABLE_PREVIEW_TOOLS=1` (preview, always $0). If quotes fail verification on `source_url`, refused and **not billed**.

### `source_lookup`

Call when you have one URL or claim to fetch/verify. Lite $0.25. Same cited envelope. Do not use as open-web search or multi-source synthesis.

## Parked / preview

### `compare_options`

Do not call yet — no live path (golden-only). Use `research_brief` instead. Registered only when `ENABLE_PREVIEW_TOOLS=1`; always `billable=false` / $0; never soft-reserves full SKU.

### `depth=deep`

Parked. With preview flag: allowed but always $0. Without flag: not in inputSchema / `preview_required` error.

## Shared envelope

```json
{
  "tldr": "string",
  "body": {},
  "confidence": "high | medium | low | unknown",
  "sources": [{ "title", "url", "publisher", "accessed", "type", "supports", "retrieved_at?" }],
  "gaps": ["string"],
  "as_of": "YYYY-MM-DD",
  "schema_version": "2026-09-14",
  "meta": { "mode": "golden|sample|live", "billable": true },
  "fail_gate": { "reason": "string", "retryable": false },
  "claims": [{ "claim", "quote", "source_url" }],
  "retrieved_at": "ISO-8601"
}
```

`meta.billable === true` is the only charge path. fail=$0 otherwise.

## Density bars

| depth | Sources |
| --- | --- |
| `quick` | ≥2 unique, ≥1 primary |
| `standard` | ≥4 unique, ≥2 primary |
| `deep` (preview) | ≥6 unique, ≥3 primary + counter-arguments + gaps |

## Credits meter

`GET /billing/credits` (Bearer / X-API-Key) → `balance_cents`, packs 1000/2500/5000¢, meters 0.25/0.60/1.50, `fail_usd: 0`. See [visible-meter.md](./visible-meter.md).
