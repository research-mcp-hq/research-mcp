# MCP Tasks dual-path (P3b) — status

**Host support: UNCONFIRMED** for Cursor / Claude / OpenAI Agents on the
2026-07-28 protocol revision (see optimization-brief.md #4 Gaps).

## Product intent

- `research_brief` stays **sync by default** (current path).
- Optional long-running **Tasks** path (`io.modelcontextprotocol/tasks`) only
  when the client advertises the tasks extension — useful for 30–120s deep
  runs that would otherwise hit host tool timeouts.
- Progress + cancel (P3a) already ship on the sync path via
  `notifications/progress` + `AbortSignal`.

## Why stubbed (not faked)

The installed `@modelcontextprotocol/server` v2 exposes Task wire schemas
(`tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`,
`notifications/tasks/status`) and `RegisteredTool.execution.taskSupport`,
but:

1. `McpServer.registerTool` public config in this SDK revision does not
   clearly document end-to-end CreateTaskResult return from a tool handler
   under our **per-request** `createMcpHandler` factory.
2. Advertising `taskSupport: "optional"` without a working task store /
   result delivery would lie to clients.
3. Host docs for Cursor/Claude/OpenAI Agents Tasks support were not
   confirmed on the brief’s source pass.

So `src/research/tasks.ts` is an honest stub: `mcpTasksPathEnabled()` is
always `false`; `ENABLE_MCP_TASKS=1` is reserved for a future commit.

## Follow-up checklist

- [ ] Confirm host Tasks support on primary hosts
- [ ] Wire capability-gated `execution.taskSupport: "optional"`
- [ ] Persist task id → research result with cancel → stop spend
- [ ] Keep charge gate: billable only on density + quotesVerified + query-tie + source_url
- [ ] Eval: sync default still used when client lacks tasks

## Out of scope

- MCP Sampling (deprecated 2026-07-28)
- Marketplace / A2A as v1
- Parallel / Exa paid keys
