// Auto-maintained static MCP server card for directory scans (Smithery etc.)
export const SERVER_CARD = {
  "serverInfo": {
    "name": "Research MCP",
    "version": "0.1.0"
  },
  "authentication": {
    "required": true,
    "schemes": [
      "apikey"
    ]
  },
  "tools": [
    {
      "name": "research_brief",
      "description": "Depth-gated cited research brief (quick/standard/deep). Live path returns query-tied excerpt packs when the charge gate passes; deep is sample in current phase.",
      "inputSchema": {
        "type": "object",
        "required": [
          "query",
          "depth"
        ],
        "properties": {
          "query": {
            "type": "string"
          },
          "depth": {
            "type": "string",
            "enum": [
              "quick",
              "standard",
              "deep"
            ]
          },
          "as_of_hint": {
            "type": "string",
            "description": "Optional YYYY-MM-DD"
          }
        }
      }
    },
    {
      "name": "compare_options",
      "description": "Side-by-side options with cited tradeoffs. Currently bills on golden matches only (no live compare path yet).",
      "inputSchema": {
        "type": "object",
        "required": [
          "options",
          "question",
          "criteria"
        ],
        "properties": {
          "options": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 2
          },
          "question": {
            "type": "string"
          },
          "criteria": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1
          }
        }
      }
    },
    {
      "name": "source_lookup",
      "description": "Fetch/verify a specific source URL or claim (can live-GET).",
      "inputSchema": {
        "type": "object",
        "required": [
          "claim_or_url",
          "ask"
        ],
        "properties": {
          "claim_or_url": {
            "type": "string"
          },
          "ask": {
            "type": "string"
          }
        }
      }
    }
  ],
  "resources": [],
  "prompts": []
} as const;
