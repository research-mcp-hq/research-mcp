/**
 * MCP Tasks dual-path stub (optimization-brief #4 / P3b).
 *
 * Spec: io.modelcontextprotocol/tasks (2026-07-28 RC). Sync path remains the
 * default for research_brief. Optional long-running task path is ONLY for
 * clients that advertise the tasks extension — and host support on
 * Cursor / Claude / OpenAI Agents for 2026-07-28 is **UNCONFIRMED**.
 *
 * Current SDK (@modelcontextprotocol/server v2) exposes Task schemas and
 * RegisteredTool.execution.taskSupport, but wiring a real CreateTaskResult /
 * tasks/get|result|cancel dual-path through createMcpHandler + our
 * per-request factory is not clear enough to ship without faking it.
 *
 * TODO(P3b): when host support is confirmed and SDK task creation from a
 * tool handler is documented end-to-end:
 *   1. Feature-flag ENABLE_MCP_TASKS=1
 *   2. Gate on client capabilities.tasks
 *   3. Advertise execution.taskSupport: "optional" on research_brief
 *   4. Keep sync path default; task path optional for deep / long runs
 *
 * Do NOT enable marketplace / A2A / Sampling as a substitute.
 */

export const MCP_TASKS_HOST_SUPPORT = "unconfirmed" as const;

export type McpTasksHostSupport = typeof MCP_TASKS_HOST_SUPPORT;

/** Env + capability gate. Always false until TODO above is done. */
export function mcpTasksPathEnabled(
  env: NodeJS.ProcessEnv = process.env,
  clientAdvertisesTasks = false,
): boolean {
  if (env.ENABLE_MCP_TASKS !== "1") return false;
  if (!clientAdvertisesTasks) return false;
  // Hard skip: do not pretend the dual-path works.
  return false;
}

/**
 * Placeholder for a future task handle. Not used while host support is
 * unconfirmed — sync research_brief remains the only live path.
 */
export interface ResearchBriefTaskStub {
  readonly kind: "mcp-tasks-stub";
  readonly status: "unsupported";
  readonly reason: string;
}

export function researchBriefTaskStub(): ResearchBriefTaskStub {
  return {
    kind: "mcp-tasks-stub",
    status: "unsupported",
    reason:
      "MCP Tasks dual-path stubbed: host support unconfirmed; sync path is default. Set ENABLE_MCP_TASKS=1 only after SDK+host wiring lands.",
  };
}
