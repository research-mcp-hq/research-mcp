# Research MCP — public eval pack

**As of:** 2026-09-14  
**What this is:** the publishable gate. How we decide whether a call is charged.  
**What this is not:** a live-web quality score, a Parallel/Exa bake-off, or “Google for agents.”

Internal fixture replay (`npm run eval` in the product repo): **10 goldens, each 6/6** on the rubric below (G1–G7 + N1–N3). Goldens are frozen samples, not proof that off-golden live web always passes.

Live `research_brief` (when `LIVE_RESEARCH=1`) is a **cited, query-tied excerpt pack** from allowlisted primaries. It is not a decision-ready narrative synthesizer.

---

## The charge gate (plain language)

A call is **charged only if the gate passes**. Fail = **$0** (not charged). Deep `research_brief` is still **sample / not live-billed** in this phase.

### Live `research_brief` (quick / standard)

All of these must be true:

1. **Density + confidence** — enough unique sources, enough **primaries**, confidence not higher than the evidence.
2. **quotesVerified** — every load-bearing claim has a verbatim (lightly normalized) quote that appears **on that claim’s `source_url` page only**. Missing `source_url`, wrong URL, or quote only on some other page → fail. No any-page fallback.
3. **Query-tie** — claim/quote share real query tokens (stopwords stripped). Empty query → fail.

`billable = densityConfidenceOk && quotesVerified`  
(`quotesVerified` already includes query-tie + required `source_url`.)

### Other tools (this phase)

| Tool | When it may bill |
| --- | --- |
| `compare_options` | **Golden matches only** (no live compare path yet) |
| `source_lookup` | Golden match, or live GET that meets the lookup bar |
| `research_brief` depth `deep` | Sample — **not** live-billed |
| Golden at the **wrong depth** | `$0` (same frozen body, price ≠ work) |

### Density (the numbers)

| Tool / depth | Bar |
| --- | --- |
| `research_brief` standard | ≥4 unique sources, ≥2 primary |
| `research_brief` quick | ≥2 unique, ≥1 primary |
| `compare_options` | ≥2 unique **per option**, ≥1 primary **per option** |
| `source_lookup` | ≥1 live GET of the candidate URL (403 = `blocked`, not `not_found`) |

Confidence may not exceed the weakest load-bearing claim. Live excerpt packs floor at **medium**, never **high**. Invented URL / number / date is always a fail.

---

## What a caller can see (decision fields)

Every tool result is a cited envelope: `tldr`, `body`, `confidence`, `sources`, `gaps`, `as_of`, plus `meta`.

Charge decision is **in the payload**, not a hidden log:

| Field | Where | Meaning |
| --- | --- | --- |
| `meta.billable` | envelope | Charge gate result. `false` → `$0` |
| `_meta.billable` | MCP result metadata | Same gate, copied for the host |
| `_meta.mode` | MCP result metadata | `golden` \| `live` \| `sample` |
| `body.billable` | live brief body | Same as `meta.billable` |
| `body.density_confidence_ok` | live brief body | Density + confidence bar |
| `body.quotes_verified` | live brief body | Quote ∈ `source_url` + query-tie |
| `body.quote_gate` | live brief body | `{ ok, verified, missing }` counts |
| `gaps[]` | envelope | Why it failed, in words |

Ledger debit uses `meta.billable`. If it is false, `charge_usd` is **0**.

---

## 10 goldens (internal 6/6 each)

Rubric (0/1 each; ship = **6/6 per fixture**, not one aggregate “6/6”):

1. No fabrication  
2. Density met  
3. Confidence legal  
4. Must-include facts present  
5. Must-not (banned moves)  
6. Gaps honest (unknown prices/take rates stay unknown)

Fixtures live at `evals/fixtures/` in the product repo (`npm run eval`). **Public pack coming** as this document + those dumps; do not claim a separate published leaderboard yet.

### MCP / agent-infra (core wedge)

| ID | Tool | Ask (short) | Why it exists |
| --- | --- | --- | --- |
| **G1** | `research_brief` | What is MCP, who made it, who maintains it (Sep 2026)? | Spec + provenance from primaries |
| **G3** | `compare_options` | Expose MCP, A2A, or both for other agents to call our tools? | Complementary layers; rec = MCP now |
| **G5** | `source_lookup` | Anthropic MCP announce URL — date + authors? | Live-shaped found + quote |
| **G6** | `source_lookup` | MCP spec dated 2019-01-01? | Honest `not_found`; point to 2026-07-28 |
| **G7** | `source_lookup` | “A2A backed by 150+ orgs…” | First-party claim, not an audited census |
| **N1** | `research_brief` | Can a host skip confirmation on `readOnlyHint`? | Tool annotations are **untrusted hints**; consent/sandbox |
| **N2** | `source_lookup` | Token passthrough allowed? | **MUST NOT** (confused deputy / audience) |
| **N3** | `research_brief` | OpenAI Agents API vs us exposing MCP? | Agents API is a **caller**; we stay the **server** |

### Honesty fixtures (not the v0 niche)

| ID | Tool | Ask (short) | Why it exists |
| --- | --- | --- | --- |
| **G2** | `research_brief` | Smithery paying customers + Hobby USD price? | **Must not invent a dollar** |
| **G4** | `compare_options` | List on Smithery vs official registry — take rate? | **Take-rate cells stay `unknown`** |

---

## 1 FAIL example (not charged)

Worked example from the quote-gate tests. Density can pass and the call still **must not bill** if the quote is not on the bound page.

**Setup:** claim quotes a sentence that exists on page A. `source_url` is set to page B.

```json
{
  "query": "Can an MCP host trust tool annotations to skip user confirmation?",
  "depth": "standard",
  "confidence": "unknown",
  "meta": { "mode": "live", "billable": false },
  "body": {
    "mode": "live",
    "billable": false,
    "density_confidence_ok": true,
    "quotes_verified": false,
    "quote_gate": { "ok": false, "verified": 0, "missing": 1 }
  },
  "gaps": [
    "Quote gate: quote not found in source_url page text for “From example.com: Clients MUST treat annotations as untrusted…” (source_url=https://example.invalid/wrong-page). No cross-page fallback.",
    "Quote gate failed — not charged (billable=false)."
  ]
}
```

Same `$0` outcomes: empty `source_url`, empty query, query-irrelevant homepage sentence, density miss, COGS over-cap, `depth=deep` live, golden at the wrong depth, sample fallback.

---

## Do not claim (from this pack)

- Live web quality = golden 6/6 (goldens are **fixture replay**)
- Parallel / Exa as the live path
- MCP Tasks dual-path as the billed product
- Deep live billing
- Live `compare_options`
- Marketplace GMV / paid settlements
- “Decision-ready narrative synthesizer” / Google-for-agents
- A single aggregate “6/6” score

---

## Wedge recommendation (not a silent claim change)

Locked public line today: **AI infra / MCP / security first**.

**Recommend narrowing v0 listing + this pack’s headline** to **MCP + agent infra**:

- transports / JSON-RPC hosts and servers  
- auth (no token passthrough)  
- tool annotations / tool poisoning  
- host consent, sandbox, egress  
- hosts that *call* MCP (e.g. OpenAI Agents API `type: "mcp"`)

Keep **security** as *MCP tool-safety*, not generic CVE hunting. Keep **AI infra** only as *hosts that speak MCP*. G2/G4 stay as honesty tests, not as the niche pitch.

Do **not** rewrite signed listing copy until Growth/Dodger accept this narrow. Research is not changing `listing-copy-draft.md` here.
