# Niche goldens — AI infra / MCP / security

Addendum to `quality-bars.md`. Same shared rules. Retrieved 2026-09-12.
Dodger: route to Code & PRs if useful; Research will not ping them.

## Niche source rules (on top of shared)

Prefer these primaries. A Twitter thread or “MCP roundup” blog is not enough for `high`.

| Niche | Primary allowlist |
|---|---|
| MCP | modelcontextprotocol.io, blog.modelcontextprotocol.io, github.com/modelcontextprotocol |
| Agent interop | a2a-protocol.org, linuxfoundation.org, developers.googleblog.com |
| Security | MCP spec Security section; MCP “Security Best Practices”; first-party vendor security docs. Named concepts (e.g. Willison “lethal trifecta”) only when a fetched primary uses the name. |
| AI infra | First-party product docs (developers.openai.com, cloud vendor docs). Marketing posts are `medium` unless fetched. |

Our tools are **read-only research**. Annotate them `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` (web). Treat our own annotations as hints, not a sandbox.

---

## Golden N1 — `research_brief` / security+MCP

**Input**

```json
{
  "query": "Can an MCP host trust tool annotations (readOnlyHint, destructiveHint) to skip user confirmation? What does the spec actually require?",
  "depth": "standard"
}
```

**Must include**

- Annotations shipped in spec revision `2025-03-26`. Fields: `readOnlyHint` (default false), `destructiveHint` (default true), `idempotentHint` (default false), `openWorldHint` (default true).
- Every property is a **hint**. Clients MUST treat annotations as **untrusted** unless the server is trusted.
- Unannotated tool = assume write, destructive, non-idempotent, open-world.
- A server can lie (`readOnlyHint: true` and still delete files). Real guarantees = consent UI, sandbox, network egress — not booleans.
- MCP spec Tool Safety: tool descriptions/annotations untrusted unless trusted server; hosts must get explicit user consent before invoking a tool.

**Must not**

- Recommend auto-approving on `readOnlyHint` from a third-party server.
- Invent a CVE number.

**Confidence:** `high`

**Gold sources**

- https://modelcontextprotocol.io/specification/2026-07-28 (Security and Trust & Safety)
- https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/ (2026-03-16)
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools (older tools page; annotations untrusted)

**Example tldr**

> No. Annotations are a risk vocabulary, not a permission system. Defaults are pessimistic; from an untrusted server they are informational only. Skip confirmation only for servers you already trust, and keep enforcement in the host (consent, sandbox, egress).

---

## Golden N2 — `source_lookup` / security

**Input**

```json
{
  "claim_or_url": "MCP servers may accept a client’s existing API token and forward it to a downstream API (token passthrough).",
  "ask": "Is this allowed?"
}
```

**Must include**

- `verdict`: `found` as a **forbidden** anti-pattern (claim is false as policy).
- Best-practices doc: token passthrough is **explicitly forbidden**. Servers MUST NOT accept tokens that were not issued for that MCP server.
- Risks named on the page: audience validation failure, confused deputy, broken audit, control circumvention.

**Must not**

- Soften MUST NOT into “not recommended.”

**Confidence:** `high`

**Gold source**

- https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices

---

## Golden N3 — `research_brief` / AI infra + MCP

**Input**

```json
{
  "query": "How does OpenAI’s Agents API connect to MCP servers, and is it a substitute for us exposing MCP tools?",
  "depth": "standard"
}
```

**Must include**

- Agents API = managed Codex harness: sessions, optional sandbox/environment, tools, MCP, subagents.
- MCP is a first-class `agent.tools` type (`type: "mcp"`, HTTP `server_url`, optional `allowed_tools` / `required`).
- Create session via `POST https://api.openai.com/v1/agents/sessions` with header `OpenAI-Beta: agents=v1` (shown in official curl).
- Example official docs MCP: `https://developers.openai.com/mcp`.
- Docs page fetched 2026-09-12: US data residency only; not ZDR-eligible (including self-hosted sandbox).
- Rec: **not a substitute**. Agents API is a **caller** (host). We remain the **server**. Listing/connect docs for that host is distribution.

**Must not**

- Treat Agents API as an interop protocol like A2A.
- State the Sep 10, 2026 launch date as `high` unless `https://openai.com/index/introducing-the-agents-api/` was fetched (403 this run — put in `gaps`).

**Confidence:** `high` on API shape (fetched docs); `unknown` on launch-day marketing claims.

**Gold sources**

- https://developers.openai.com/api/docs/guides/agents-api/overview
- https://developers.openai.com/api/docs/guides/agents-api/tools/mcp (if fetched in-run)
- Gap: https://openai.com/index/introducing-the-agents-api/ (403 on 2026-09-12)

---

## Golden N4 — `compare_options` / MCP vs A2A (niche rec, same as core)

Already in `quality-bars.md`. Keep it. Niche gloss: for *this product*, MCP is the v1 interface; A2A is later discovery/delegation. OpenAI Agents API is a host that speaks MCP, not a third option to “expose instead.”

---

## Eval extras for Code & PRs

Score the new goldens with the same 6/6 rubric.

Suggested `depth` mapping for fixtures:

| depth | Extra bar |
|---|---|
| `quick` | ≥2 sources, 1 primary; shorter body OK |
| `standard` | existing density (≥4 / ≥2 primary) |
| `deep` | ≥6 unique, ≥3 primary, explicit counter-arguments + gaps |

N1 and N3 are `standard`. N2 is `source_lookup` (unchanged).
