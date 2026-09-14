/**
 * Phase-only progress for live research_brief (optimization-brief #4 / P3a).
 * Phases: searching → extracting → verifying.
 * Never emit "found N primaries" (or any pre-verify density claims) before verify.
 */

export type PipelinePhase = "searching" | "extracting" | "verifying";

export const PIPELINE_PHASES: readonly PipelinePhase[] = [
  "searching",
  "extracting",
  "verifying",
] as const;

/** Optional reporter — MCP progress notifications or test collectors. */
export type ProgressReporter = (
  phase: PipelinePhase,
) => void | Promise<void>;

export function phaseProgressIndex(phase: PipelinePhase): {
  progress: number;
  total: number;
} {
  const progress = PIPELINE_PHASES.indexOf(phase) + 1;
  return { progress, total: PIPELINE_PHASES.length };
}

/**
 * Build an MCP `notifications/progress` reporter when the client supplied
 * `_meta.progressToken`. No-op (undefined) when token absent.
 */
export function createMcpProgressReporter(ctx: {
  mcpReq: {
    _meta?: { progressToken?: string | number };
    notify: (notification: {
      method: string;
      params?: Record<string, unknown>;
    }) => Promise<void>;
  };
}): ProgressReporter | undefined {
  const token = ctx.mcpReq._meta?.progressToken;
  if (token === undefined || token === null) return undefined;

  return async (phase: PipelinePhase) => {
    const { progress, total } = phaseProgressIndex(phase);
    try {
      await ctx.mcpReq.notify({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress,
          total,
          // Phase name only — never pre-verify source counts.
          message: phase,
        },
      });
    } catch {
      // Progress is best-effort; do not fail the tool on notify errors.
    }
  };
}

export class PipelineCancelledError extends Error {
  readonly code = "cancelled" as const;
  readonly phase: PipelinePhase | "preflight";

  constructor(phase: PipelinePhase | "preflight", message?: string) {
    super(message ?? `research_brief cancelled during ${phase}`);
    this.name = "PipelineCancelledError";
    this.phase = phase;
  }
}

/** Throw PipelineCancelledError if signal already aborted. */
export function throwIfAborted(
  signal: AbortSignal | undefined,
  phase: PipelinePhase | "preflight",
): void {
  if (signal?.aborted) {
    throw new PipelineCancelledError(phase);
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof PipelineCancelledError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  ) {
    return true;
  }
  return false;
}
