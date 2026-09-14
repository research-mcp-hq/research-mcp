# Tools — JSON Schema / OpenAPI-ish

Shared response envelope (all tools):

```json
{
  "tldr": "string",
  "body": {},
  "confidence": "high | medium | low | unknown",
  "sources": [
    {
      "title": "string",
      "url": "https://...",
      "publisher": "string",
      "accessed": "YYYY-MM-DD",
      "type": "primary | secondary",
      "supports": "string"
    }
  ],
  "gaps": ["string"],
  "as_of": "YYYY-MM-DD",
  "meta": {
    "mode": "golden | sample | live",
    "billable": true
  }
}
```

`meta.mode` / `meta.billable` drive the usage charge gate (sample/demo and quality-bar fails → no charge).

Depth density bars:

| depth | Sources |
| --- | --- |
| `quick` | ≥2 unique, ≥1 primary |
| `standard` | ≥4 unique, ≥2 primary |
| `deep` | ≥6 unique, ≥3 primary + counter-arguments + gaps |

---

## `research_brief`

### Input

```json
{
  "type": "object",
  "required": ["query", "depth"],
  "properties": {
    "query": { "type": "string" },
    "depth": { "type": "string", "enum": ["quick", "standard", "deep"] },
    "as_of_hint": { "type": "string", "description": "Optional YYYY-MM-DD" }
  }
}
```

### Output

Shared envelope plus:

```json
{
  "query": "string",
  "depth": "quick | standard | deep"
}
```

Off-golden sample briefs set `body.mode=sample`, `meta.billable=false`, and label MCP/A2A URLs as **fixture-set anchors** (not fetched for the caller query). Not charged as research.

Optional live: `LIVE_RESEARCH=1` + `depth=quick` may return DuckDuckGo snippet leads (`meta.mode=live`, typically `billable=false` — snippet-only is not bar-passing).

Annotations: `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=true`.

---

## `compare_options`

### Input

```json
{
  "type": "object",
  "required": ["options", "question", "criteria"],
  "properties": {
    "options": { "type": "array", "items": { "type": "string" }, "minItems": 2 },
    "question": { "type": "string" },
    "criteria": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
  }
}
```

### Output

Shared envelope plus:

```json
{
  "options": ["string"],
  "question": "string",
  "criteria": ["string"]
}
```

`body` typically includes a criteria table and a **conditional** recommendation. Unknown criteria (e.g. take_rate) stay `"unknown"` with gaps.

Off-golden sample compares: `body.mode=sample`, `meta.billable=false`, fixture-set anchors only — not charged as research.

Density: ≥2 unique sources per option, ≥1 primary per option.

---

## `source_lookup`

### Input

```json
{
  "type": "object",
  "required": ["claim_or_url", "ask"],
  "properties": {
    "claim_or_url": { "type": "string" },
    "ask": { "type": "string" }
  }
}
```

### Output

Shared envelope plus:

```json
{
  "claim_or_url": "string",
  "ask": "string",
  "verdict": "found | not_found | moved | conflicting | blocked | unaudited",
  "http_status": 200
}
```

Behavior:

| Input | Behavior |
| --- | --- |
| Golden match | Frozen fixture; `meta.mode=golden`, billable |
| Off-golden `https?://` URL | Real HTTP GET (~8s timeout, redirects followed). `http_status` only from the response — **never invented**. 2xx → `found`; 404 → `not_found`; 403 → `blocked` (not `not_found`); network/timeout → `http_status: null`, confidence `unknown` |
| Off-golden non-URL claim | `verdict: unaudited`, confidence `unknown`, `http_status: null`, no fabricated sources; live fetch/search required |

`http_status` may be `null` when no HTTP response was received (claim-only / fetch failed).

Annotations: same read-only / open-world hints as other tools.
