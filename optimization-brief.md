# Research MCP — optimization brief (2026-09-14)

Locked product. SKU $0.25 / $0.60 / $1.50; fail bar = no charge.
Do not reopen the wedge. Do not wrap commodity search.

## Where we are

Charge gate = `meta.billable === true` only.

| Tool | What can actually bill today |
|---|---|
| `research_brief` | Golden keyword hits only (any depth, same frozen body). Live = DDG snippets, always `$0`. Off-golden standard/deep = sample, `$0`. |
| `compare_options` | Two golden pairs only. No live path. |
| `source_lookup` | Goldens, or live GET with ≥80-char excerpt. 403=blocked, network=null status, non-URL=unaudited. |

So the paid SKUs for *real* research are mostly unreachable. Credit precheck still demands full SKU before a call that may return `$0`.

## Do this, in order

### 1. Search → Extract → synthesize (unblocks standard)
Replace DDG snippets with: search for URLs, fetch/extract page text, synthesize with citations. Same shape as Parallel / Perplexity (`web_search` + `fetch_url`) / Tavily Search+Extract.

Map SKUs to **capped** upstream, not open-ended agents:

| SKU | Plausible upstream (fetched list prices) | Stay under |
|---|---|---|
| $0.25 | Parallel Responses low/medium (~$0.01–0.05) or Exa Deep (~$0.012–0.015) | yes |
| $0.60 | Parallel Responses high (~$0.25) or Task core/pro (~$0.025–0.10) + synth | yes |
| $1.50 | Parallel Task pro–ultra (~$0.10–0.30). **Avoid** Tavily Research pro (up to **$2.00**) and Exa Agent `auto`/`max` ($5/$20 caps) | must cap |

Parallel Task does not bill failed runs — matches fail=no-charge.
Complexity **M**. This is the only change that makes `standard` honestly billable.

### 2. Fail-closed quote gate (unblocks trust)
Every load-bearing claim: verbatim (or high-threshold normalized) quote ∈ fetched page text. Weakest claim sets confidence. Fail → error, `$0`.
Start with text match; add an entailment judge later (CiteGuard: LLM-as-judge alone is weak).
Complexity **S–M**. Latency +1–5s. Over-strict match is the risk (high no-charge rate).

### 3. Hard COGS cap per SKU
Config, not a new product. Prefer per-request processors over dynamic credit ceilings. Without this, deep can lose money on day one.
Complexity **S**.

### 4. Progress + cancel, then MCP Tasks
Phase-only progress (`searching` / `extracting` / `verifying`) — never “found 6 primaries” before verify. Honor cancel / HTTP disconnect to stop spend.
MCP Tasks (`io.modelcontextprotocol/tasks`) for 30–120s `research_brief` **when the client advertises the extension**. Dual path required: host Tasks support for Cursor/Claude/OpenAI Agents on 2026-07-28 is **unconfirmed**.
Complexity progress **S–M**, Tasks **M**. Unblocks *deep* UX more than quality.

### 5. Honest cache + source Resources
Cache URL body by URL + content hash + `as_of` + volatility TTL. Always emit `source: cached|live`. Bypass for “live” claims.
Optionally expose `resources://run/{id}/source/{n}` with short `ttlMs` / private `cacheScope` (don’t dump full copyrighted pages).
Complexity **M**. Margin, not a new SKU.

## Do not do (90 days)

- Thin search-wrapper MCP
- MCP Sampling (deprecated 2026-07-28) — call the LLM provider directly
- Marketplace as the billing path
- A2A as v1
- Uncapped Tavily Research / Exa Agent `auto`

## Also fix while here (small)

- Stop billing `depth=deep` on an unchanged golden body (price ≠ work).
- Soft-reserve credits, or precheck only when the path can be billable.
- Raise lookup bar: ask-aligned quote + page date/publisher; 80 chars is too cheap to pass.
- Network-error verdict: prefer `blocked`/`unaudited`, not `not_found`.
- Lookup miss: search a replacement (already in the quality bar).

## 90-day sequence

1. #1 + #3 → charge **standard** for real queries  
2. #2 → charge only on verify pass  
3. #4 → make **deep** survive host timeouts  
4. #5 → margin + audit  

## Sources (fetched / vendor docs)

- Parallel Search+Extract: https://parallel.ai/blog/parallel-search-api
- Parallel pricing: https://docs.parallel.ai/getting-started/pricing
- Perplexity: https://docs.perplexity.ai/docs/getting-started/pricing
- Tavily credits: https://docs.tavily.com/documentation/api-credits
- Exa: https://exa.ai/pricing?tab=api
- Firecrawl: https://www.firecrawl.dev/pricing.md
- MCP Tasks: https://modelcontextprotocol.io/extensions/tasks/overview.md
- MCP 2026-07-28 RC (Tasks official; Sampling deprecated): https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- Progress / cancel: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress
- Resources ttlMs: https://modelcontextprotocol.io/specification/2026-07-28/server/resources
- VeriQuote: https://www.npmjs.com/package/veriquote
- CiteGuard: https://arxiv.org/html/2510.17853v4
- Cache-aside: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
- Stale tool-result contract: https://tianpan.co/blog/2026-04-28-tool-result-cache-stale-data-contract
- Don’t wrap search MCP: https://mcpize.com/blog/build-mcp-server-that-sells

## Gaps

- Cursor / Claude / OpenAI Agents support for MCP Tasks not confirmed on primary host docs this pass.
- QuoteVerify paper URL 500; used VeriQuote + CiteGuard instead.
- No GMV invented.
