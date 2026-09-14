# Bot-to-bot landscape (as of 2026-09-12)

Sourced snapshot. No product recommendations. Product already locked: paid research MCP.

## Protocols that matter

- **MCP** — agent↔tools. De facto standard, AAIF (donated Dec 9, 2025). https://modelcontextprotocol.io/
- **A2A v1.0** — agent↔agent (Mar 12, 2026). Complements MCP. https://a2a-protocol.org/latest/
- **ACP** — merged into A2A (Aug 29, 2025). Do not build on it.
- **OpenAI Agents API** — public beta Sep 10, 2026. Platform harness, not interop.
- **x402 over MCP** — per-tool USDC micropayments. Spec: https://github.com/coinbase/x402
- **ANP / IETF drafts** — real but not default.
- **AG-UI** — agent↔frontend, not agent↔agent.

## Discovery vs checkout

Official registry = preview metadata only (≥5,000 latest entries probed Sep 12; nextCursor still set). https://registry.modelcontextprotocol.io

Directories that do **not** pay publishers: official registry, PulseMCP, mcp.so, Claude Connectors, Cursor Marketplace, Smithery-as-catalog.

Claude Connectors: **804** listed Sep 12, usage-ranked; top slots are productivity SaaS (Drive, Slack, Notion, Figma…), not research. Submit via Team/Enterprise admin. https://claude.com/connectors

Smithery acquired by Arcade **Aug 5, 2026**. Hosted listings often show x402 per-call USDC. https://www.arcade.dev/blog/smithery-joins-arcade/

agent.ai marketplace appears faded (domain now HubSpot BuilderPack).

## Listing path for our server (already in pricing addendum)

1. `server.json` → official registry (GitHub/DNS namespace)
2. Cross-list PulseMCP, mcp.so, Smithery
3. Client install: Claude Connectors + Cursor Marketplace + Grok Bot remote HTTPS MCP
4. Bill on our Stripe key; optional Apify PPE / MCPize / x402 as channels

## Failed / faded

IBM ACP independent protocol; ChatGPT plugins (superseded by Apps SDK); Smithery independence; agent.ai as a general agent store.
