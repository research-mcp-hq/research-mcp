/**
 * R1 demand instrumentation — privacy-safe category mix.
 * Emits type:"demand" JSON lines next to usage when DEMAND_LOG=1.
 * Classifier may read query text in-memory then drop it — never log query/claim/ask/question.
 */

import { createHash } from "node:crypto";
import type { Depth, ResearchMeta, Source } from "./types.js";

export type TopicBucket = "mcp" | "agent_infra" | "mcp_security" | "other";
export type DemandHost =
  | "cursor"
  | "claude"
  | "openai_agents"
  | "smithery"
  | "unknown";
export type DemandPath = "golden" | "live" | "sample";
export type DemandMeter = "lite" | "standard" | "deep";
export type DemandOutcome =
  | "bar_pass"
  | "bar_fail"
  | "cogs_abort"
  | "unaudited"
  | "blocked"
  | "cancelled";
export type FailReasonCode =
  | "quote_miss"
  | "density"
  | "query_tie"
  | "empty_source_url"
  | "cogs"
  | "sample";

export interface DemandEvent {
  type: "demand";
  ts: string;
  request_id: string;
  tool: string;
  depth: Depth | null;
  meter: DemandMeter;
  topic_bucket: TopicBucket;
  host: DemandHost;
  path: DemandPath;
  billable: boolean;
  outcome: DemandOutcome;
  charge_usd: number;
  customer_key_hash: string | null;
  break_glass: boolean;
  fail_reason_code?: FailReasonCode;
  primary_count?: number;
  unique_source_count?: number;
}

/** Keys that must never appear on a demand event (privacy). */
export const FORBIDDEN_DEMAND_KEYS = [
  "query",
  "question",
  "claim_or_url",
  "ask",
  "claim",
  "claims",
  "user_agent",
  "userAgent",
  "authorization",
  "api_key",
  "apiKey",
  "raw_query",
] as const;

const MCP_SECURITY_TOKENS = [
  "readonlyhint",
  "destructivehint",
  "token passthrough",
  "confused deputy",
  "tool poisoning",
  "annotation",
  "tool annotations",
  "mcp security",
  "security best practices",
];

const MCP_TOKENS = [
  "model context protocol",
  "modelcontextprotocol",
  "mcp server",
  "mcp host",
  "mcp servers",
  "json-rpc",
  "mcp",
];

const AGENT_INFRA_TOKENS = [
  "agents api",
  "openai agents",
  'type: mcp',
  'type: "mcp"',
  "claude connector",
  "tool calling",
  "cursor",
];

/** Honesty / marketplace pricing fixtures (G2/G4-like) → force other. */
const PRICING_OTHER_TOKENS = [
  "list price",
  "take rate",
  "paying customer",
  "paying customers",
  "hobby plan",
  "marketplace pricing",
  "take_rate",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasToken(haystack: string, token: string): boolean {
  const t = token.toLowerCase();
  if (t === "mcp") {
    // Word-boundary-ish: avoid matching inside unrelated tokens
    return /(?:^|[^a-z0-9])mcp(?:[^a-z0-9]|$)/i.test(haystack);
  }
  if (t === "cursor") {
    return /(?:^|[^a-z0-9])cursor(?:[^a-z0-9]|$)/i.test(haystack);
  }
  if (t === "annotation") {
    // Prefer annotation(s) but not random substrings of longer words
    return /(?:^|[^a-z0-9])annotations?(?:[^a-z0-9]|$)/i.test(haystack);
  }
  return haystack.includes(t);
}

/**
 * Rule-based topic_bucket classifier (v0).
 * Priority: mcp_security > (pricing honesty → other) > mcp > agent_infra > other.
 * Call with query/claim/ask/question text, then drop that text — never log it.
 */
export function classifyTopicBucket(text: string | undefined | null): TopicBucket {
  if (!text || !text.trim()) return "other";
  const n = normalize(text);

  for (const tok of MCP_SECURITY_TOKENS) {
    if (hasToken(n, tok)) return "mcp_security";
  }

  // G2/G4-like pricing / take-rate honesty → other (even if "MCP" appears)
  for (const tok of PRICING_OTHER_TOKENS) {
    if (hasToken(n, tok)) return "other";
  }

  for (const tok of MCP_TOKENS) {
    if (hasToken(n, tok)) return "mcp";
  }

  for (const tok of AGENT_INFRA_TOKENS) {
    if (hasToken(n, tok)) return "agent_infra";
  }

  return "other";
}

/**
 * Best-effort host from User-Agent / MCP client metadata headers.
 * Documented map (PR/docs):
 * - cursor: UA or client name contains "cursor"
 * - claude: "claude", "anthropic" desktop/connector
 * - openai_agents: "openai-agents", "openai agents", "agents sdk"
 * - smithery: "smithery"
 * - else unknown — never infer from query text
 */
export function detectHost(headers: Record<string, string | string[] | undefined> | undefined): DemandHost {
  if (!headers) return "unknown";
  const pick = (name: string): string => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v)) return v.join(" ");
    return typeof v === "string" ? v : "";
  };
  const blob = normalize(
    [
      pick("user-agent"),
      pick("User-Agent"),
      pick("x-mcp-client"),
      pick("x-mcp-client-name"),
      pick("mcp-client-name"),
      pick("x-client-name"),
      pick("x-client-id"),
      pick("x-smithery-client"),
    ].join(" "),
  );
  if (!blob) return "unknown";
  if (/\bsmithery\b/.test(blob)) return "smithery";
  if (/\bcursor\b/.test(blob)) return "cursor";
  if (/\bclaude\b/.test(blob) || /\banthropic\b/.test(blob)) return "claude";
  if (
    /\bopenai[-_ ]?agents\b/.test(blob) ||
    /\bagents[-_ ]?sdk\b/.test(blob) ||
    /\bopenai.*agents\b/.test(blob)
  ) {
    return "openai_agents";
  }
  return "unknown";
}

export function meterForTool(tool: string, depth: string | undefined): DemandMeter {
  if (tool === "source_lookup") return "lite";
  if (tool === "research_brief") {
    if (depth === "deep") return "deep";
    if (depth === "quick") return "lite";
    return "standard";
  }
  // compare_options → standard SKU band
  return "standard";
}

export function pathFromMode(mode: ResearchMeta["mode"] | undefined): DemandPath {
  if (mode === "golden" || mode === "live" || mode === "sample") return mode;
  return "sample";
}

/** Truncated hash of key id (not raw API key). Null for break-glass. */
export function customerKeyHash(
  keyId: string | undefined,
  breakGlass: boolean | undefined,
): string | null {
  if (breakGlass) return null;
  if (!keyId || keyId === "unknown") return null;
  return createHash("sha256").update(keyId, "utf8").digest("hex").slice(0, 16);
}

export function mapFailReasonCode(input: {
  fail_gate?: { reason?: string };
  gaps?: string[];
  body?: unknown;
}): FailReasonCode | undefined {
  const reason = input.fail_gate?.reason ?? "";
  const gapsText = (input.gaps ?? []).join(" ").toLowerCase();
  const body =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : null;

  if (body?.cogs_abort === true || reason === "cogs_cap_exceeded" || /\bcogs\b/.test(gapsText)) {
    return "cogs";
  }
  if (reason === "sample_path" || /\bsample\b/.test(gapsText)) {
    return "sample";
  }
  if (
    reason === "quote_gate_failed" ||
    /quote gate|quote.?miss|not found in extracted|not found in source_url/i.test(gapsText)
  ) {
    if (/query[- ]?tie|query token/i.test(gapsText)) return "query_tie";
    if (/empty.?source_url|missing source_url|unbound/i.test(gapsText)) {
      return "empty_source_url";
    }
    return "quote_miss";
  }
  if (
    reason === "density_bar_failed" ||
    /density|not charged|billable=false/i.test(gapsText)
  ) {
    if (/query[- ]?tie|query token/i.test(gapsText)) return "query_tie";
    if (/density/i.test(gapsText) || reason === "density_bar_failed") return "density";
  }
  if (/query[- ]?tie|query token/i.test(gapsText)) return "query_tie";
  if (/empty.?source_url|missing source_url/i.test(gapsText)) return "empty_source_url";
  if (reason === "sample_path") return "sample";
  return undefined;
}

export function mapOutcome(input: {
  billable: boolean;
  mode?: ResearchMeta["mode"];
  fail_gate?: { reason?: string };
  gaps?: string[];
  body?: unknown;
  verdict?: string;
  http_status?: number | null;
}): DemandOutcome {
  const body =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : null;
  const reason = input.fail_gate?.reason ?? "";
  const gapsText = (input.gaps ?? []).join(" ").toLowerCase();

  if (body?.cancelled === true || reason === "cancelled" || /\bcancelled\b/.test(gapsText)) {
    return "cancelled";
  }
  if (body?.cogs_abort === true || reason === "cogs_cap_exceeded") {
    return "cogs_abort";
  }
  if (input.verdict === "blocked" || input.http_status === 403) {
    return "blocked";
  }
  if (input.verdict === "unaudited") {
    return "unaudited";
  }
  if (input.billable) {
    return "bar_pass";
  }
  // Sample / preview / quality fail → bar_fail (path still carries sample)
  return "bar_fail";
}

export function sourceCounts(sources: Source[] | undefined): {
  primary_count?: number;
  unique_source_count?: number;
} {
  if (!sources || sources.length === 0) return {};
  const primary_count = sources.filter((s) => s.type === "primary").length;
  const urls = new Set(
    sources.map((s) => (s.url || "").trim().toLowerCase()).filter(Boolean),
  );
  return {
    primary_count,
    unique_source_count: urls.size || sources.length,
  };
}

export function isDemandLogEnabled(): boolean {
  return process.env.DEMAND_LOG === "1";
}

export interface BuildDemandInput {
  requestId: string;
  tool: string;
  depth?: string;
  /** In-memory only — used for topic_bucket then discarded */
  classifyText?: string;
  headers?: Record<string, string | string[] | undefined>;
  meta?: ResearchMeta;
  billable: boolean;
  charge_usd: number;
  keyId?: string;
  breakGlass?: boolean;
  fail_gate?: { reason?: string };
  gaps?: string[];
  body?: unknown;
  sources?: Source[];
  verdict?: string;
  http_status?: number | null;
  ts?: string;
}

/**
 * Build a demand event. Never includes query-like fields.
 * Safe to call even when DEMAND_LOG is off (for tests).
 */
export function buildDemandEvent(input: BuildDemandInput): DemandEvent {
  const topic_bucket = classifyTopicBucket(input.classifyText);
  // Drop classifyText — must not appear on event
  const depth: Depth | null =
    input.tool === "research_brief" && input.depth
      ? (input.depth as Depth)
      : null;
  const counts = sourceCounts(input.sources);
  const fail_reason_code = mapFailReasonCode({
    fail_gate: input.fail_gate,
    gaps: input.gaps,
    body: input.body,
  });
  const event: DemandEvent = {
    type: "demand",
    ts: input.ts ?? new Date().toISOString(),
    request_id: input.requestId,
    tool: input.tool,
    depth,
    meter: meterForTool(input.tool, input.depth),
    topic_bucket,
    host: detectHost(input.headers),
    path: pathFromMode(input.meta?.mode),
    billable: input.billable,
    outcome: mapOutcome({
      billable: input.billable,
      mode: input.meta?.mode,
      fail_gate: input.fail_gate,
      gaps: input.gaps,
      body: input.body,
      verdict: input.verdict,
      http_status: input.http_status,
    }),
    charge_usd: input.billable ? input.charge_usd : 0,
    customer_key_hash: customerKeyHash(input.keyId, input.breakGlass),
    break_glass: Boolean(input.breakGlass),
  };
  if (fail_reason_code) event.fail_reason_code = fail_reason_code;
  if (counts.primary_count !== undefined) event.primary_count = counts.primary_count;
  if (counts.unique_source_count !== undefined) {
    event.unique_source_count = counts.unique_source_count;
  }
  return event;
}

/** Assert no forbidden keys (for tests + runtime guard). */
export function assertNoQueryKeys(event: Record<string, unknown>): void {
  for (const k of FORBIDDEN_DEMAND_KEYS) {
    if (Object.prototype.hasOwnProperty.call(event, k)) {
      throw new Error(`demand event must not contain key: ${k}`);
    }
  }
}

/**
 * Emit demand JSON line. Swallow/log failures — never throw to callers.
 */
export function logDemandEvent(event: DemandEvent): void {
  if (!isDemandLogEnabled()) return;
  try {
    const obj = { ...event } as Record<string, unknown>;
    assertNoQueryKeys(obj);
    process.stdout.write(`${JSON.stringify(obj)}\n`);
  } catch (err) {
    try {
      process.stderr.write(
        `${JSON.stringify({
          type: "demand_log_error",
          message: err instanceof Error ? err.message : String(err),
        })}\n`,
      );
    } catch {
      // swallow
    }
  }
}
