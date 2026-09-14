import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { applyChargeGate, type UsageLogger } from "./usage.js";
import { runCompareOptions, runResearchBrief, runSourceLookup } from "./research/index.js";
import { SERVER_NAME, VERSION } from "./version.js";
import type { ResearchMeta } from "./types.js";

const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: true,
} as const;

export interface ToolCallContext {
  requestId: string;
  keyId: string;
  usage: UsageLogger;
}

function jsonResult(data: unknown, meta?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    _meta: meta,
  };
}

function resultMeta(data: { meta?: ResearchMeta }): ResearchMeta | undefined {
  return data.meta;
}

/**
 * Per-request MCP server factory. Tools are read-only research (annotations are hints).
 */
export function createResearchMcpServer(ctx: ToolCallContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });

  server.registerTool(
    "research_brief",
    {
      title: "Research brief",
      description:
        "Decision-ready research brief on a topic with sources, confidence, and gaps. Depth: quick | standard | deep.",
      inputSchema: z.object({
        query: z.string().describe("Research question"),
        depth: z.enum(["quick", "standard", "deep"]).describe("Research depth"),
        as_of_hint: z
          .string()
          .optional()
          .describe("Optional YYYY-MM-DD freshness hint"),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ query, depth, as_of_hint }) => {
      const started = Date.now();
      const result = await runResearchBrief({ query, depth, as_of_hint });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("research_brief", depth, resultMeta(result));
      ctx.usage.log({
        requestId: ctx.requestId,
        tool: "research_brief",
        keyId: ctx.keyId,
        latencyMs,
        ...est,
        timestamp: new Date().toISOString(),
      });
      return jsonResult(result, {
        requestId: ctx.requestId,
        latencyMs,
        mode: est.mode,
        billable: est.billable,
      });
    },
  );

  server.registerTool(
    "compare_options",
    {
      title: "Compare options",
      description:
        "Side-by-side comparison on named criteria with conditional recommendation. Unknown cells stay unknown.",
      inputSchema: z.object({
        options: z.array(z.string()).min(2).describe("Options to compare"),
        question: z.string().describe("Decision question"),
        criteria: z.array(z.string()).min(1).describe("Shared criteria"),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ options, question, criteria }) => {
      const started = Date.now();
      const result = runCompareOptions({ options, question, criteria });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("compare_options", undefined, resultMeta(result));
      ctx.usage.log({
        requestId: ctx.requestId,
        tool: "compare_options",
        keyId: ctx.keyId,
        latencyMs,
        ...est,
        timestamp: new Date().toISOString(),
      });
      return jsonResult(result, {
        requestId: ctx.requestId,
        latencyMs,
        mode: est.mode,
        billable: est.billable,
      });
    },
  );

  server.registerTool(
    "source_lookup",
    {
      title: "Source lookup",
      description:
        "Verify or expand a claim/URL. Returns verdict (found|not_found|moved|conflicting|blocked|unaudited), http_status from a real GET when applicable, and envelope.",
      inputSchema: z.object({
        claim_or_url: z.string().describe("Claim text or URL to resolve"),
        ask: z.string().describe("What to verify or extract"),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ claim_or_url, ask }) => {
      const started = Date.now();
      const result = await runSourceLookup({ claim_or_url, ask });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("source_lookup", undefined, resultMeta(result));
      ctx.usage.log({
        requestId: ctx.requestId,
        tool: "source_lookup",
        keyId: ctx.keyId,
        latencyMs,
        ...est,
        timestamp: new Date().toISOString(),
      });
      return jsonResult(result, {
        requestId: ctx.requestId,
        latencyMs,
        mode: est.mode,
        billable: est.billable,
      });
    },
  );

  return server;
}
