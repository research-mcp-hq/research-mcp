import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  applyChargeGate,
  InsufficientCreditsError,
  type UsageLogger,
} from "./usage.js";
import { getLedgerDb } from "./billing/db.js";
import { assertSufficientCredits } from "./billing/ledger.js";
import {
  briefPathMayBeBillable,
  comparePathMayBeBillable,
  lookupPathMayBeBillable,
} from "./research/samples.js";
import { runCompareOptions, runResearchBrief, runSourceLookup } from "./research/index.js";
import { SERVER_NAME, VERSION } from "./version.js";
import type { Depth, ResearchMeta } from "./types.js";

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
  customerId?: string;
  breakGlass?: boolean;
}

function jsonResult(data: unknown, meta?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    _meta: meta,
  };
}

function errorResult(code: string, message: string) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, message }),
      },
    ],
    structuredContent: { error: code, message },
  };
}

function resultMeta(data: { meta?: ResearchMeta }): ResearchMeta | undefined {
  return data.meta;
}

/**
 * Credit precheck: demand full SKU cents only when the path can be billable.
 * Known non-billable paths (sample, depth-mismatched golden, COGS abort,
 * non-URL unaudited lookup) soft-reserve 0 — skip full SKU assert.
 * Charge gate still enforces $0 for sample/quality-fail/COGS-abort after the call.
 */
function precheckCredits(
  ctx: ToolCallContext,
  tool: string,
  depth: string | undefined,
  mayBeBillable: boolean,
): ReturnType<typeof errorResult> | null {
  if (ctx.breakGlass || !ctx.customerId) return null;
  if (!mayBeBillable) {
    // Soft-reserve 0: path known non-billable — do not demand full SKU upfront
    return null;
  }
  const db = getLedgerDb();
  if (!db) return null;
  try {
    assertSufficientCredits(db, ctx.customerId, tool, depth);
    return null;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return errorResult("insufficient_credits", err.message);
    }
    throw err;
  }
}

function logUsage(
  ctx: ToolCallContext,
  tool: string,
  depth: string | undefined,
  latencyMs: number,
  est: ReturnType<typeof applyChargeGate>,
): ReturnType<typeof errorResult> | null {
  try {
    ctx.usage.log({
      requestId: ctx.requestId,
      tool,
      keyId: ctx.keyId,
      latencyMs,
      ...est,
      depth,
      customerId: ctx.customerId,
      breakGlass: ctx.breakGlass,
      timestamp: new Date().toISOString(),
    });
    return null;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return errorResult("insufficient_credits", err.message);
    }
    throw err;
  }
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
      const mayBill = briefPathMayBeBillable(query, depth as Depth);
      const blocked = precheckCredits(ctx, "research_brief", depth, mayBill);
      if (blocked) return blocked;

      const started = Date.now();
      const result = await runResearchBrief({ query, depth, as_of_hint });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("research_brief", depth, resultMeta(result));
      const debitErr = logUsage(ctx, "research_brief", depth, latencyMs, est);
      if (debitErr) return debitErr;
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
      const mayBill = comparePathMayBeBillable(options, question);
      const blocked = precheckCredits(ctx, "compare_options", undefined, mayBill);
      if (blocked) return blocked;

      const started = Date.now();
      const result = runCompareOptions({ options, question, criteria });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("compare_options", undefined, resultMeta(result));
      const debitErr = logUsage(ctx, "compare_options", undefined, latencyMs, est);
      if (debitErr) return debitErr;
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
      const mayBill = lookupPathMayBeBillable(claim_or_url);
      const blocked = precheckCredits(ctx, "source_lookup", undefined, mayBill);
      if (blocked) return blocked;

      const started = Date.now();
      const result = await runSourceLookup({ claim_or_url, ask });
      const latencyMs = Date.now() - started;
      const est = applyChargeGate("source_lookup", undefined, resultMeta(result));
      const debitErr = logUsage(ctx, "source_lookup", undefined, latencyMs, est);
      if (debitErr) return debitErr;
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
