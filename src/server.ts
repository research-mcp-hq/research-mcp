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
  lookupPathMayBeBillable,
} from "./research/samples.js";
import {
  createMcpProgressReporter,
  runCompareOptions,
  runResearchBrief,
  runSourceLookup,
} from "./research/index.js";
import { SERVER_NAME, VERSION } from "./version.js";
import type { Depth, ResearchMeta } from "./types.js";
import {
  deriveFailGate,
  stampContract,
  type FailGate,
} from "./contract.js";
import {
  isPreviewToolsEnabled,
  previewDeepRejectedMessage,
  researchBriefDepthEnum,
} from "./preview.js";

const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: true,
} as const;

const PREVIEW_ANNOTATIONS = {
  ...TOOL_ANNOTATIONS,
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

function forceNonBillable<T extends { meta?: ResearchMeta; gaps?: string[] }>(
  result: T,
  gap: string,
): T {
  const gaps = [...(result.gaps ?? [])];
  if (!gaps.includes(gap)) gaps.push(gap);
  return {
    ...result,
    gaps,
    meta: {
      mode: result.meta?.mode ?? "sample",
      billable: false,
    },
  };
}

function envelopeResult(
  result: Record<string, unknown> & { meta?: ResearchMeta },
  forcePreviewZero: boolean,
): Record<string, unknown> {
  let stamped = result;
  if (forcePreviewZero) {
    stamped = forceNonBillable(
      stamped as { meta?: ResearchMeta; gaps?: string[] },
      "Preview / parked path — always billable=false ($0); not a full SKU.",
    ) as typeof stamped;
  }
  const fail_gate: FailGate | undefined = deriveFailGate(stamped);
  return stampContract(stamped, fail_gate ? { fail_gate } : undefined);
}

/**
 * Credit precheck: demand full SKU cents only when the path can be billable.
 * Preview/parked paths soft-reserve 0 — never full SKU.
 */
function precheckCredits(
  ctx: ToolCallContext,
  tool: string,
  depth: string | undefined,
  mayBeBillable: boolean,
): ReturnType<typeof errorResult> | null {
  if (ctx.breakGlass || !ctx.customerId) return null;
  if (!mayBeBillable) {
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
 * Per-request MCP server factory.
 * Default paid tools: research_brief (quick|standard) + source_lookup.
 * ENABLE_PREVIEW_TOOLS=1 parks compare_options + depth=deep as preview ($0).
 */
export function createResearchMcpServer(ctx: ToolCallContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });
  const preview = isPreviewToolsEnabled();
  const depthEnum = researchBriefDepthEnum();

  const briefDescription = preview
    ? "Cited research brief (quick|standard live; deep=preview always $0). Envelope tldr/body/confidence/sources/gaps/as_of + schema_version. Quote-fail → refuse, not billed."
    : "Call when you need cited, query-tied excerpt packs on AI infra, MCP, or security. Use depth=quick ($0.25) or depth=standard ($0.60). Returns envelope tldr/body/confidence/sources/gaps/as_of. Do not call with depth=deep (sample only, not live-billed). If quotes fail verification on source_url, the run is refused and not billed.";

  server.registerTool(
    "research_brief",
    {
      title: "Research brief",
      description: briefDescription,
      inputSchema: z.object({
        query: z.string().describe("Research question"),
        depth: z
          .enum(depthEnum as unknown as [string, ...string[]])
          .describe(
            preview
              ? "Research depth (deep is preview / always $0)"
              : "Research depth: quick | standard",
          ),
        as_of_hint: z
          .string()
          .optional()
          .describe("Optional YYYY-MM-DD freshness hint"),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ query, depth, as_of_hint }, mcpCtx) => {
      // Defense in depth if a client bypasses schema
      if (depth === "deep" && !preview) {
        return errorResult("preview_required", previewDeepRejectedMessage());
      }

      const isPreviewDepth = depth === "deep";
      // Preview deep: never soft-reserve full SKU
      const mayBill =
        !isPreviewDepth && briefPathMayBeBillable(query, depth as Depth);
      const blocked = precheckCredits(ctx, "research_brief", depth, mayBill);
      if (blocked) return blocked;

      const signal = mcpCtx?.mcpReq?.signal;
      const onProgress = mcpCtx
        ? createMcpProgressReporter(mcpCtx)
        : undefined;

      const started = Date.now();
      const raw = await runResearchBrief(
        { query, depth: depth as Depth, as_of_hint },
        { signal, onProgress },
      );
      const result = envelopeResult(
        raw as unknown as Record<string, unknown> & { meta?: ResearchMeta },
        isPreviewDepth,
      );
      const latencyMs = Date.now() - started;
      const meta = resultMeta(result as { meta?: ResearchMeta });
      const est = applyChargeGate("research_brief", depth, meta);
      // Preview deep must always charge $0 even if a golden matched
      if (isPreviewDepth) {
        est.billable = false;
        est.charge_usd = 0;
        est.estimatedCostUsd = 0;
      }
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

  if (preview) {
    server.registerTool(
      "compare_options",
      {
        title: "Compare options (preview)",
        description:
          "[PREVIEW] Side-by-side comparison — parked; always billable=false ($0). No live path yet. Prefer research_brief for production.",
        inputSchema: z.object({
          options: z.array(z.string()).min(2).describe("Options to compare"),
          question: z.string().describe("Decision question"),
          criteria: z.array(z.string()).min(1).describe("Shared criteria"),
        }),
        annotations: PREVIEW_ANNOTATIONS,
      },
      async ({ options, question, criteria }) => {
        // Preview: never soft-reserve full SKU
        const blocked = precheckCredits(
          ctx,
          "compare_options",
          undefined,
          false,
        );
        if (blocked) return blocked;

        const started = Date.now();
        const raw = runCompareOptions({ options, question, criteria });
        const result = envelopeResult(
          raw as unknown as Record<string, unknown> & { meta?: ResearchMeta },
          true,
        );
        const latencyMs = Date.now() - started;
        const est = applyChargeGate(
          "compare_options",
          undefined,
          resultMeta(result as { meta?: ResearchMeta }),
        );
        est.billable = false;
        est.charge_usd = 0;
        est.estimatedCostUsd = 0;
        const debitErr = logUsage(
          ctx,
          "compare_options",
          undefined,
          latencyMs,
          est,
        );
        if (debitErr) return debitErr;
        return jsonResult(result, {
          requestId: ctx.requestId,
          latencyMs,
          mode: est.mode,
          billable: false,
          preview: true,
        });
      },
    );
  }

  server.registerTool(
    "source_lookup",
    {
      title: "Source lookup",
      description:
        "Call when you have one URL or claim to fetch/verify. Lite $0.25. Same cited envelope. Do not use as open-web search or multi-source synthesis.",
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
      const raw = await runSourceLookup({ claim_or_url, ask });
      const result = envelopeResult(
        raw as unknown as Record<string, unknown> & { meta?: ResearchMeta },
        false,
      );
      const latencyMs = Date.now() - started;
      const est = applyChargeGate(
        "source_lookup",
        undefined,
        resultMeta(result as { meta?: ResearchMeta }),
      );
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
