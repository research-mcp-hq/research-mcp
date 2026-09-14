# Research MCP — pricing and GTM addendum

As of 2026-09-12. Numbers only from fetched vendor pages or named docs. Product is locked: paid deep research MCP (`research_brief`, `compare_options`, `source_lookup`).

## Decision

Do **not** depend on an MCP marketplace for revenue. Bill a human-held Stripe API key (prepaid credits or monthly bucket). List on registries for discovery only. Optional x402 later for sub-dollar agent calls.

FiatDock (13 Aug 2026, self-reported) recorded **$0 third-party paid MCP settlements**. PulseMCP / official registry / Smithery take **$0** of creator GMV — they are directories, not checkout.

## Who converts today

Shipping paid MCP is mostly **connector runtimes** (Zapier, Composio, Arcade) and **data APIs wrapped as MCP** (Tavily, Firecrawl, Apify PPE). Standalone paid MCP that looks like us: **Ref** (docs search). Indie “list it and they will pay” is unproven (DEV.to x402 wrapper: $0.00).

Do not compete on generic `search` / `scrape`.

## Price the outcome, not the hop

Closest analogs:

| Analog | Unit | Published | URL |
|---|---|---|---|
| Agent402 research | per research call | **$0.60** | https://agent402.tools/tools/research |
| AiScale `synthesize_research` | per call | **$0.15** | https://github.com/ry4ever/ai-agent |
| Parallel Task | per 1k runs | **$5–$2,400** (~$0.005–$2.40/run) | https://docs.parallel.ai/getting-started/pricing |
| Ref (closest standalone MCP) | credit = search or read | Free 200; Pro **$50/mo / 6,000**; PAYG **$10 / 1,000**; legacy $9/1,000 still honored | https://docs.ref.tools/usage/pricing |
| Tavily (COGS floor for search) | credit | **$0.008** | https://tavily.com/pricing |

**Recommended v1 SKU**

- Lite `research_brief` / `source_lookup`: **$0.25**
- Standard `research_brief` / `compare_options`: **$0.60** (match Agent402)
- Deep `research_brief`: **$1.50**
- Or monthly: **$29 / 50 standard briefs**, then list overage
- Refund or no-charge if the call fails the quality bar (fabrication / density miss)

Card rails cannot charge below **$0.50** (Stripe Machine Payments). So do **not** bill a raw card per cheap lookup — prepaid credits or a monthly bucket. x402 USDC floor is **$0.01** if we add agent-pay later.

MCPize: creator keeps **80%**, x402 tool price **0.01–100 USDC**. Use as a channel, not the core meter. https://mcpize.com/docs/monetization

## 90-day risk (do not relitigate the lock)

Independent ranking of wedges for *this team* put **metered PR-review MCP** ahead of **cited research** for 90-day revenue (seat spend at Greptile/CodeRabbit is clearer than standalone research GMV). Research still has public WTP analogs; the risk is quality vs Parallel/Perplexity and COGS. Win a slice with the quality bars we already wrote, niche (AI infra / MCP / security), and refund-on-fail.

## GTM (90 days)

1. Stripe customer portal + API key (human pays).
2. List on official MCP registry + PulseMCP + Smithery/Arcade (discovery, $0 take).
3. Optional MCPize/MCPChannel listing (20% if they process).
4. Public eval pack = the golden fixtures (10 graded questions).
5. Cursor / Claude “add server” demos. Not an agent OS, not crypto-only.

## Sources

- FiatDock honesty: https://fiatdock.com/mcp-marketplace.html
- Zapier MCP: https://docs.zapier.com/mcp/overview/usage
- Composio: https://composio.dev/pricing
- Arcade: https://arcade.dev/pricing
- Ref: https://docs.ref.tools/usage/pricing
- MCPize: https://mcpize.com/docs/monetization
- Apify PPE 80/20: https://docs.apify.com/actors/publishing/monetize/pay-per-event
- Official registry: https://modelcontextprotocol.io/registry/about
- Stripe machine payments: https://docs.stripe.com/payments/machine
- Agent402: https://agent402.tools/tools/research
- Parallel: https://docs.parallel.ai/getting-started/pricing
- Tavily: https://tavily.com/pricing
- Greptile: https://www.greptile.com/pricing
- CodeRabbit: https://www.coderabbit.ai/pricing

## Gaps

- No independent GMV for MCPize/MCPChannel paid servers.
- Smithery public pricing is a stub post-Arcade (5 Aug 2026).
- Perplexity Agent API $/query not fully pinned.
- FiatDock $0 is self-reported.
