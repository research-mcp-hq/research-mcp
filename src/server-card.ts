// Static MCP server card for directory scans (Smithery etc.).
// Default publish surface: research_brief (quick|standard) + source_lookup.
// compare_options / depth=deep are parked (finish-or-hide); listed as do-not-call.
export const SERVER_CARD = {
  serverInfo: {
    name: "Research MCP",
    version: "0.1.0",
  },
  authentication: {
    required: true,
    schemes: ["apikey"],
  },
  tools: [
    {
      name: "research_brief",
      description:
        "Call when you need cited, query-tied excerpt packs on AI infra, MCP, or security. Use depth=quick ($0.25) or depth=standard ($0.60). Returns envelope tldr/body/confidence/sources/gaps/as_of. Do not call with depth=deep (sample only, not live-billed). If quotes fail verification on source_url, the run is refused and not billed.",
      inputSchema: {
        type: "object",
        required: ["query", "depth"],
        properties: {
          query: { type: "string" },
          depth: {
            type: "string",
            enum: ["quick", "standard"],
          },
          as_of_hint: {
            type: "string",
            description: "Optional YYYY-MM-DD",
          },
        },
      },
    },
    {
      name: "source_lookup",
      description:
        "Call when you have one URL or claim to fetch/verify. Lite $0.25. Same cited envelope. Do not use as open-web search or multi-source synthesis.",
      inputSchema: {
        type: "object",
        required: ["claim_or_url", "ask"],
        properties: {
          claim_or_url: { type: "string" },
          ask: { type: "string" },
        },
      },
    },
    {
      name: "compare_options",
      description:
        "Do not call yet — no live path (golden-only). Use research_brief instead.",
      inputSchema: {
        type: "object",
        required: ["options", "question", "criteria"],
        properties: {
          options: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
          },
          question: { type: "string" },
          criteria: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
      },
    },
  ],
  resources: [],
  prompts: [],
} as const;
