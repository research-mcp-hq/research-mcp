# Research MCP — quality bars and golden fixtures

Product: paid deep research-as-a-service MCP.
Tools: `research_brief`, `compare_options`, `source_lookup`.
Audience: Code & PRs (implementation + eval fixtures). Retrieved 2026-09-12.

These fixtures are frozen against sources fetched on 2026-09-12. Re-fetch before treating dates/versions as still current.

---

## Shared rules (all tools)

A response **fails** if any of these are true:

1. Invents a URL, quote, number, date, or named source.
2. Cites a URL that was not fetched or returned in search in that run.
3. States a contested or marketing claim as fact without attributing the claimant.
4. Omits `confidence` or uses a level that the sources do not support.
5. Leaves a gap silent when a required fact could not be verified.

### Confidence

| Level | When to use |
| --- | --- |
| `high` | Claim restated from a fetched **primary** (official spec, first-party blog, first-party press). |
| `medium` | Reputable secondary, or two consistent secondaries, or a primary that is clearly promotional. |
| `low` | Single unconfirmed secondary, or only a search snippet (page not fetched). |
| `unknown` | Not found, fetch failed, or sources conflict. Must say what would resolve it. |

Overall response confidence = the **lowest** confidence of any load-bearing claim.

### Source object (required shape)

```json
{
  "title": "string",
  "url": "https://...",
  "publisher": "string",
  "accessed": "YYYY-MM-DD",
  "type": "primary | secondary",
  "supports": "which claim this source is for"
}
```

### Shared output envelope

```json
{
  "tldr": "1-3 sentences. Lead with the answer.",
  "body": "structured findings",
  "confidence": "high | medium | low | unknown",
  "sources": [],
  "gaps": ["what is missing and how to resolve it"],
  "as_of": "2026-09-12"
}
```

---

## 1. `research_brief`

**Job:** Decision-ready brief on a topic. Not a link dump.

### Good looks like

- `tldr` first, with a recommendation or the actual answer.
- Then short sections (what it is, who owns it, current status, implications).
- Every non-obvious fact has a source.
- Contradictions are named, not averaged away.
- Ends with `gaps` even if empty (`[]` is allowed only when density is met).

### Density

- ≥ **4** unique sources
- ≥ **2** primary
- ≥ **1** source per non-obvious claim
- Prefer spec + first-party announcement over blogs

### Fail

- Essay with no rec
- All secondary / all same publisher
- "According to sources" with no URLs

### Golden 1 — happy path

**Input**

```json
{
  "query": "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
  "depth": "standard"
}
```

**Must include**

- Open protocol connecting LLM apps to external data/tools (not an agent-to-agent peer protocol).
- Open-sourced by Anthropic on **2024-11-25**.
- Created by **David Soria Parra** and **Justin Spahr-Summers**.
- Donated to the **Agentic AI Foundation (AAIF)**, a Linux Foundation directed fund (announced **2025-12-09**).
- Current spec version observed **2026-07-28** at modelcontextprotocol.io.
- Hosts / clients / servers; JSON-RPC 2.0.

**Must not**

- Invent install counts or "industry standard" without attributing the speaker.
- Call MCP an agent-to-agent protocol (that is A2A's job).

**Expected confidence:** `high` (multiple fetched primaries).

**Required sources (any 4+, these are the gold set)**

- https://www.anthropic.com/news/model-context-protocol (2024-11-25)
- https://github.com/modelcontextprotocol/modelcontextprotocol
- https://modelcontextprotocol.io/specification/2026-07-28
- https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation (2025-12-09)
- https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation

**Example tldr**

> MCP is an open JSON-RPC protocol that lets LLM hosts talk to tool/data servers. Anthropic open-sourced it on 25 Nov 2024 (authors: David Soria Parra, Justin Spahr-Summers) and donated it to the Linux Foundation Agentic AI Foundation on 9 Dec 2025. Latest published spec we fetched is 2026-07-28.

### Golden 2 — sparse / uncertain

**Input**

```json
{
  "query": "How many paying customers does Smithery have for hosted MCP servers, and what is Hobby plan list price in USD?",
  "depth": "standard"
}
```

**Must include**

- Registry listing of *external* servers is free (observed via secondary pricing writeups; confirm on live page).
- Hosted plans named Hobby / Pro / Custom exist in public writeups.
- **Exact USD list prices were not on a fetchable static page** in this research — must be `unknown` or `low`, not a guessed dollar amount.
- `gaps` must say: fetch https://smithery.ai/pricing (JS-rendered) or a first-party blog.

**Must not**

- Invent a dollar price.
- Treat agenticindex.io or apis.io as primary.

**Expected confidence:** `low` or `unknown`.

---

## 2. `compare_options`

**Job:** Side-by-side on named criteria. Pick a winner **per criterion** and an overall "if you care about X".

### Good looks like

- Options scoped in one line each (what they are *for*).
- Shared criteria (purpose, layer, governance, maturity, typical user).
- One table or equivalent.
- Recommendation is conditional, not "A is better."
- Same no-invention rule for pricing and adoption stats.

### Density

- ≥ **2** unique sources **per option**
- ≥ **1** primary **per option**
- If a criterion has no source, mark `unknown` — do not fill the cell

### Fail

- Feature laundry list with no criteria
- Mixing MCP vs A2A as if they compete for the same job without saying they are complementary
- Using one vendor blog as the only source for both sides

### Golden 1 — happy path

**Input**

```json
{
  "options": ["MCP", "A2A"],
  "question": "We want other agents to call our research tools. Should we expose MCP, A2A, or both?",
  "criteria": ["job_to_be_done", "layer", "governance", "maturity_as_of_2026-09"]
}
```

**Must include**

- MCP = vertical: host/client ↔ tool/data server. Spec 2026-07-28. AAIF founding project (donated 2025-12-09).
- A2A = horizontal: opaque agents discover (agent card), delegate, collaborate. Created by Google; Linux Foundation project 2025-06-23; AAIF Growth Stage as of 2026-08-27. Spec v1.0.0.
- A2A's own docs describe MCP as vertical and A2A as horizontal — treat as complementary, not substitutes.
- Rec: **expose MCP now** (this product *is* a tool server other agents call). Add A2A later if we want agent-card discovery / peer delegation across vendors.

**Must not**

- Declare a single winner with no "if".
- Repeat A2A's "150+ orgs" as an independent fact — attribute to a2a-protocol.org (2026-08-27).

**Expected confidence:** `high` on protocol roles; `medium` on adoption counts.

**Required sources**

- https://modelcontextprotocol.io/specification/2026-07-28
- https://www.anthropic.com/news/model-context-protocol
- https://a2a-protocol.org/latest/specification/
- https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/
- https://www.linuxfoundation.org/press/linux-foundation-launches-the-agentic-ai-foundation (A2A: https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- https://github.com/a2aproject/A2A

**Example tldr**

> Ship MCP. Callers are LLM hosts that need tools (`research_brief`, etc.). A2A is the peer-agent layer (agent cards, delegation). Complementary; A2A is a later distribution surface, not the v1 interface.

### Golden 2 — missing criterion data

**Input**

```json
{
  "options": ["Smithery listing", "Official MCP registry"],
  "question": "Where should we list a paid metered research MCP first?",
  "criteria": ["listing_cost", "built_in_metering", "reach", "take_rate"]
}
```

**Must include**

- Smithery: external listing described as free in third-party plan writeups; hosted plans are paid. Confirm on smithery.ai.
- Official MCP registry exists (called out in Anthropic AAIF post). Do **not** invent its take rate.
- `take_rate` cells = `unknown` with a gap: "need first-party marketplace terms."
- Rec can still rank **distribution first** (list where callers already browse) while refusing a fake take-rate comparison.

**Must not**

- Invent a % take rate for either registry.

**Expected confidence:** `low` / mixed; overall should not be `high`.

---

## 3. `source_lookup`

**Job:** Resolve a claim or URL. Return found / not_found / moved / conflicting.

### Good looks like

- Verdict first (`found` | `not_found` | `moved` | `conflicting` | `blocked`).
- Canonical URL if one exists.
- Short quote or close paraphrase of what the page **actually says**.
- Fetch status (200, 404, 403, timeout).
- Publisher + date on the page.

### Density

- ≥ **1** live fetch of the candidate URL
- If miss: ≥ **1** search for a replacement, then fetch that
- Never report "exists" from a search title alone

### Fail

- "Yes" without a quote
- Treating a 403/block page as "does not exist"
- Rewriting the page to say what the caller hoped

### Golden 1 — found

**Input**

```json
{
  "claim_or_url": "https://www.anthropic.com/news/model-context-protocol",
  "ask": "When was MCP announced and who are the named authors?"
}
```

**Must include**

- `verdict`: `found`
- Date on page: **Nov 25, 2024**
- Authors: **David Soria Parra** and **Justin Spahr-Summers**
- Quote or close paraphrase: open-sourcing MCP as a standard for connecting AI assistants to systems where data lives
- `http_status`: 200 (or equivalent success)

**Expected confidence:** `high`

### Golden 2 — not found

**Input**

```json
{
  "claim_or_url": "https://modelcontextprotocol.io/specification/2019-01-01",
  "ask": "Is there an MCP spec dated 2019-01-01?"
}
```

**Must include**

- `verdict`: `not_found` (or `moved` only if a fetch/search finds a real replacement — there should not be a 2019 spec)
- Report fetch failure / 404
- Point to the **actual** latest spec we know: https://modelcontextprotocol.io/specification/2026-07-28
- Do not invent a 2019 document

**Expected confidence:** `high` on the negative (after fetch + search)

### Golden 3 — conflicting / attributed marketing

**Input**

```json
{
  "claim_or_url": "A2A is backed by over 150 organizations and runs in production across supply chains, financial services, and mobile.",
  "ask": "Verify this claim."
}
```

**Must include**

- `verdict`: `found` as **first-party project claim**, not independently audited
- Attribute to https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/
- Confidence on the *count*: `medium` (primary but self-reported; no third-party roster fetched)
- `gaps`: "Need the org list or AAIF/LF roster to treat 150 as audited."

**Must not**

- Upgrade 150 to a verified census.

**Expected confidence:** `medium`

---

## Eval rubric (for Code & PRs)

Score each fixture 0/1 on:

1. **No fabrication** — no invented URL/number/date
2. **Density met** — counts above
3. **Confidence legal** — level matches evidence
4. **Must-include** — all gold facts present
5. **Must-not** — none of the banned moves
6. **Gaps honest** — unknown prices/take rates stay unknown

Ship bar: **6/6 on every golden**. A pretty answer that invents a take rate fails the product.

---

## Suggested tool JSON schemas (implement to this)

### `research_brief`

```json
{
  "query": "string",
  "depth": "quick | standard | deep",
  "as_of_hint": "optional YYYY-MM-DD"
}
```

### `compare_options`

```json
{
  "options": ["string"],
  "question": "string",
  "criteria": ["string"]
}
```

### `source_lookup`

```json
{
  "claim_or_url": "string",
  "ask": "string"
}
```

Return the shared envelope. `source_lookup` adds `verdict` and `http_status`.
