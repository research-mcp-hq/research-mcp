/**
 * Frozen sample responses for quality-bars.md goldens (as_of 2026-09-12).
 * These are the ship-bar fixtures — no invented prices/take rates/install counts.
 */

import {
  AS_OF,
  type CompareOptionsResult,
  type ResearchBriefResult,
  type SourceLookupResult,
} from "../types.js";

export function goldenBriefHappy(): ResearchBriefResult {
  return {
    query:
      "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
    depth: "standard",
    tldr:
      "MCP is an open JSON-RPC protocol that lets LLM hosts talk to tool/data servers. Anthropic open-sourced it on 25 Nov 2024 (authors: David Soria Parra, Justin Spahr-Summers) and donated it to the Linux Foundation Agentic AI Foundation on 9 Dec 2025. Latest published spec we fetched is 2026-07-28.",
    body: {
      what_it_is:
        "An open protocol connecting LLM applications (hosts/clients) to external data and tools via MCP servers. It uses JSON-RPC 2.0. It is not an agent-to-agent peer protocol.",
      creators: {
        open_sourced_by: "Anthropic",
        open_source_date: "2024-11-25",
        named_authors: ["David Soria Parra", "Justin Spahr-Summers"],
      },
      governance: {
        donated_to: "Agentic AI Foundation (AAIF), a Linux Foundation directed fund",
        donation_announced: "2025-12-09",
      },
      current_status: {
        spec_version_observed: "2026-07-28",
        spec_url: "https://modelcontextprotocol.io/specification/2026-07-28",
        roles: ["hosts", "clients", "servers"],
        transport_note: "JSON-RPC 2.0 messages between host/client and servers",
      },
      implications:
        "For a paid research tool product, MCP is the natural interface: callers are LLM hosts that need tools, not peer agents.",
    },
    confidence: "high",
    sources: [
      {
        title: "Introducing the Model Context Protocol",
        url: "https://www.anthropic.com/news/model-context-protocol",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "Open-sourced 2024-11-25; purpose as connector for AI assistants to data/tools",
      },
      {
        title: "modelcontextprotocol specification repository",
        url: "https://github.com/modelcontextprotocol/modelcontextprotocol",
        publisher: "Model Context Protocol (GitHub)",
        accessed: AS_OF,
        type: "primary",
        supports: "Protocol home / spec source of truth",
      },
      {
        title: "MCP Specification 2026-07-28",
        url: "https://modelcontextprotocol.io/specification/2026-07-28",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Current observed spec version; hosts/clients/servers; JSON-RPC 2.0",
      },
      {
        title: "Linux Foundation announces the Agentic AI Foundation",
        url: "https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation",
        publisher: "Linux Foundation",
        accessed: AS_OF,
        type: "primary",
        supports: "AAIF formation; MCP donated as founding project (2025-12-09)",
      },
      {
        title: "Donating MCP and establishing the Agentic AI Foundation",
        url: "https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "Authors David Soria Parra and Justin Spahr-Summers; donation narrative",
      },
    ],
    gaps: [],
    as_of: AS_OF,
  };
}

export function goldenBriefSparse(): ResearchBriefResult {
  return {
    query:
      "How many paying customers does Smithery have for hosted MCP servers, and what is Hobby plan list price in USD?",
    depth: "standard",
    tldr:
      "Public sources describe Smithery registry listing of external servers as free and name Hobby / Pro / Custom hosted plans, but exact USD list prices and paying-customer counts were not on a fetchable static page in this research. Confidence is unknown/low; do not treat any dollar figure as verified.",
    body: {
      what_we_can_say: [
        "Third-party pricing writeups describe listing external MCP servers on the Smithery registry as free.",
        "Hosted plan names Hobby, Pro, and Custom appear in public secondary writeups.",
        "Paying-customer count for hosted MCP servers was not verified from a first-party source.",
      ],
      what_we_cannot_say: [
        "Exact Hobby plan list price in USD (not confirmed on a static first-party page).",
        "Number of paying customers.",
      ],
      secondary_notes:
        "agenticindex.io / apis.io style aggregators are secondary only and must not be treated as primary pricing.",
    },
    confidence: "unknown",
    sources: [
      {
        title: "Smithery (homepage / product surface)",
        url: "https://smithery.ai",
        publisher: "Smithery",
        accessed: AS_OF,
        type: "primary",
        supports: "Product exists; pricing detail not confirmed from static fetch in this run",
      },
      {
        title: "Smithery pricing page (JS-rendered; confirm live)",
        url: "https://smithery.ai/pricing",
        publisher: "Smithery",
        accessed: AS_OF,
        type: "primary",
        supports: "Candidate first-party pricing URL — needs live/JS fetch to confirm USD amounts",
      },
      {
        title: "Third-party Smithery plan writeups (secondary)",
        url: "https://apis.io",
        publisher: "apis.io (secondary aggregator)",
        accessed: AS_OF,
        type: "secondary",
        supports: "Mentions Hobby/Pro/Custom plan names and free external listing — not primary",
      },
      {
        title: "Agentic index / marketplace commentary (secondary)",
        url: "https://agenticindex.io",
        publisher: "agenticindex.io (secondary)",
        accessed: AS_OF,
        type: "secondary",
        supports: "Secondary commentary only; not a source of list price",
      },
    ],
    gaps: [
      "Fetch https://smithery.ai/pricing (JS-rendered) or a first-party Smithery blog to confirm Hobby USD list price.",
      "Obtain first-party disclosure for paying-customer count; do not invent a number.",
    ],
    as_of: AS_OF,
  };
}

export function goldenCompareHappy(): CompareOptionsResult {
  return {
    options: ["MCP", "A2A"],
    question:
      "We want other agents to call our research tools. Should we expose MCP, A2A, or both?",
    criteria: ["job_to_be_done", "layer", "governance", "maturity_as_of_2026-09"],
    tldr:
      "Ship MCP. Callers are LLM hosts that need tools (`research_brief`, etc.). A2A is the peer-agent layer (agent cards, delegation). Complementary; A2A is a later distribution surface, not the v1 interface.",
    body: {
      option_scope: {
        MCP: "Vertical: host/client ↔ tool/data server (JSON-RPC tools/resources).",
        A2A: "Horizontal: opaque agents discover via agent cards, delegate, and collaborate.",
      },
      table: [
        {
          criterion: "job_to_be_done",
          MCP: "Expose tools/data to LLM hosts (this product is a tool server).",
          A2A: "Peer agent discovery and delegation across vendors.",
          winner_if: "If callers are hosts needing tools → MCP.",
        },
        {
          criterion: "layer",
          MCP: "Vertical integration layer (host ↔ server).",
          A2A: "Horizontal agent-to-agent layer (A2A docs describe MCP as vertical, A2A as horizontal).",
          winner_if: "Complementary layers — not substitutes.",
        },
        {
          criterion: "governance",
          MCP: "Donated to AAIF / Linux Foundation directed fund (announced 2025-12-09); founding project.",
          A2A: "Created by Google; Linux Foundation project 2025-06-23; AAIF Growth Stage as of 2026-08-27.",
          winner_if: "Both LF/AAIF-aligned; pick by job, not governance brand.",
        },
        {
          criterion: "maturity_as_of_2026-09",
          MCP: "Spec observed 2026-07-28 at modelcontextprotocol.io; broad host/client ecosystem.",
          A2A: "Spec v1.0.0; project claims production use — adoption counts are first-party (see attribution).",
          winner_if: "For tool-server UX today → MCP; for agent-card federation later → add A2A.",
        },
      ],
      recommendation: {
        overall:
          "Expose MCP now. Add A2A later if we want agent-card discovery / peer delegation across vendors.",
        conditional: [
          "If you care about Cursor/Claude/host tool calling → MCP first.",
          "If you care about cross-vendor agent delegation → plan A2A as a second surface.",
        ],
        adoption_note:
          "A2A's '150+ organizations' figure is attributed to a2a-protocol.org (2026-08-27), not independently audited here.",
      },
    },
    confidence: "high",
    sources: [
      {
        title: "MCP Specification 2026-07-28",
        url: "https://modelcontextprotocol.io/specification/2026-07-28",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "MCP role as host/client ↔ server; current spec version",
      },
      {
        title: "Introducing the Model Context Protocol",
        url: "https://www.anthropic.com/news/model-context-protocol",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "MCP purpose and Anthropic open-source announcement",
      },
      {
        title: "A2A Protocol Specification",
        url: "https://a2a-protocol.org/latest/specification/",
        publisher: "a2a-protocol.org",
        accessed: AS_OF,
        type: "primary",
        supports: "A2A as agent-to-agent; agent cards; complementary to MCP (vertical vs horizontal)",
      },
      {
        title: "A new chapter for A2A — joining the Agentic AI Foundation",
        url: "https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/",
        publisher: "a2a-protocol.org",
        accessed: AS_OF,
        type: "primary",
        supports: "AAIF Growth Stage 2026-08-27; first-party '150+ orgs' claim (attributed)",
      },
      {
        title: "Linux Foundation launches the Agent2Agent protocol project",
        url: "https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents",
        publisher: "Linux Foundation",
        accessed: AS_OF,
        type: "primary",
        supports: "A2A as LF project (2025-06-23)",
      },
      {
        title: "A2A GitHub organization / project",
        url: "https://github.com/a2aproject/A2A",
        publisher: "GitHub / a2aproject",
        accessed: AS_OF,
        type: "primary",
        supports: "A2A project home; spec v1.0.0 lineage",
      },
    ],
    gaps: [
      "Independent third-party roster to audit A2A '150+ organizations' claim was not fetched.",
    ],
    as_of: AS_OF,
  };
}

export function goldenCompareMissing(): CompareOptionsResult {
  return {
    options: ["Smithery listing", "Official MCP registry"],
    question: "Where should we list a paid metered research MCP first?",
    criteria: ["listing_cost", "built_in_metering", "reach", "take_rate"],
    tldr:
      "List where callers already browse for distribution first. Smithery external listing is described as free in third-party writeups; the official MCP registry exists (Anthropic AAIF post). Take rate for both is unknown — do not invent a % comparison.",
    body: {
      option_scope: {
        "Smithery listing": "Third-party MCP directory / hosted surface (Arcade-era context).",
        "Official MCP registry": "Official registry called out in Anthropic AAIF materials.",
      },
      table: [
        {
          criterion: "listing_cost",
          "Smithery listing":
            "External listing described as free in third-party plan writeups; confirm on smithery.ai.",
          "Official MCP registry": "Listing cost not independently confirmed in this run.",
          winner_if: "If zero listing cost matters and Smithery free listing holds → Smithery for discovery.",
        },
        {
          criterion: "built_in_metering",
          "Smithery listing": "Not verified as a first-party checkout/meter for arbitrary paid MCPs.",
          "Official MCP registry": "Directory, not a payment rail — do not assume built-in metering.",
          winner_if: "Meter via your own Stripe API key; treat registries as discovery only.",
        },
        {
          criterion: "reach",
          "Smithery listing": "Known browsing surface for MCP servers (qualitative).",
          "Official MCP registry": "Canonical discovery path referenced by Anthropic/AAIF materials.",
          winner_if: "If you care about official-ecosystem reach → official registry; list both if cheap.",
        },
        {
          criterion: "take_rate",
          "Smithery listing": "unknown",
          "Official MCP registry": "unknown",
          winner_if: "Cannot rank on take rate without first-party marketplace terms.",
        },
      ],
      recommendation: {
        overall:
          "Prioritize distribution (list where callers browse). Refuse a fake take-rate comparison until first-party terms are fetched.",
        conditional: [
          "If discovery on Smithery is free → list there for reach.",
          "If official registry listing is available → list there for canonical reach.",
          "Bill humans via Stripe API keys; do not depend on registry take rate for revenue.",
        ],
      },
    },
    confidence: "low",
    sources: [
      {
        title: "Smithery",
        url: "https://smithery.ai",
        publisher: "Smithery",
        accessed: AS_OF,
        type: "primary",
        supports: "Smithery as listing/hosted surface; pricing details need live confirm",
      },
      {
        title: "Smithery pricing (confirm live)",
        url: "https://smithery.ai/pricing",
        publisher: "Smithery",
        accessed: AS_OF,
        type: "primary",
        supports: "Candidate page for listing cost / hosted plans",
      },
      {
        title: "About the MCP registry",
        url: "https://modelcontextprotocol.io/registry/about",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Official MCP registry exists",
      },
      {
        title: "Donating MCP / Agentic AI Foundation (registry callout)",
        url: "https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "Official registry called out in Anthropic AAIF post",
      },
    ],
    gaps: [
      "need first-party marketplace terms for take_rate on Smithery and the official MCP registry.",
      "Confirm Smithery external listing cost on https://smithery.ai/pricing (JS-rendered).",
    ],
    as_of: AS_OF,
  };
}

export function goldenLookupFound(): SourceLookupResult {
  return {
    claim_or_url: "https://www.anthropic.com/news/model-context-protocol",
    ask: "When was MCP announced and who are the named authors?",
    verdict: "found",
    http_status: 200,
    tldr:
      "Found. Anthropic announced MCP on Nov 25, 2024. Named authors: David Soria Parra and Justin Spahr-Summers. Page describes open-sourcing MCP as a standard for connecting AI assistants to systems where data lives.",
    body: {
      canonical_url: "https://www.anthropic.com/news/model-context-protocol",
      page_date: "2024-11-25",
      authors: ["David Soria Parra", "Justin Spahr-Summers"],
      paraphrase:
        "Anthropic open-sourced the Model Context Protocol as an open standard for connecting AI assistants to the systems where data lives.",
      publisher: "Anthropic",
    },
    confidence: "high",
    sources: [
      {
        title: "Introducing the Model Context Protocol",
        url: "https://www.anthropic.com/news/model-context-protocol",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "Announcement date Nov 25, 2024; authors; open-sourcing purpose",
      },
    ],
    gaps: [],
    as_of: AS_OF,
  };
}

export function goldenLookupNotFound(): SourceLookupResult {
  return {
    claim_or_url: "https://modelcontextprotocol.io/specification/2019-01-01",
    ask: "Is there an MCP spec dated 2019-01-01?",
    verdict: "not_found",
    http_status: 404,
    tldr:
      "Not found. There is no MCP specification dated 2019-01-01 (fetch returned 404 / failure). The latest published spec observed in this research is 2026-07-28.",
    body: {
      attempted_url: "https://modelcontextprotocol.io/specification/2019-01-01",
      fetch_result: "404 / not found — no 2019 MCP spec document",
      replacement:
        "Use https://modelcontextprotocol.io/specification/2026-07-28 (observed latest).",
      search_note:
        "Replacement search points to post-2024 MCP specs only; do not invent a 2019 document.",
    },
    confidence: "high",
    sources: [
      {
        title: "MCP Specification 2026-07-28 (actual latest observed)",
        url: "https://modelcontextprotocol.io/specification/2026-07-28",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Canonical current spec after 2019 URL miss",
      },
      {
        title: "Introducing the Model Context Protocol",
        url: "https://www.anthropic.com/news/model-context-protocol",
        publisher: "Anthropic",
        accessed: AS_OF,
        type: "primary",
        supports: "MCP open-sourced 2024-11-25 — inconsistent with a 2019 spec",
      },
    ],
    gaps: [],
    as_of: AS_OF,
  };
}

export function goldenLookupConflicting(): SourceLookupResult {
  return {
    claim_or_url:
      "A2A is backed by over 150 organizations and runs in production across supply chains, financial services, and mobile.",
    ask: "Verify this claim.",
    verdict: "found",
    http_status: 200,
    tldr:
      "Found as a first-party project claim on a2a-protocol.org (2026-08-27), not as an independently audited census. Attribute the '150+ organizations' and production-industry language to that post; confidence on the count is medium.",
    body: {
      attribution_url:
        "https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/",
      what_the_page_claims:
        "First-party A2A project blog states backing by over 150 organizations and production use across domains such as supply chains, financial services, and mobile.",
      independent_audit: false,
      how_to_read:
        "Treat as self-reported project marketing / status language until a roster or LF/AAIF list is fetched.",
    },
    confidence: "medium",
    sources: [
      {
        title: "A new chapter for A2A — joining the Agentic AI Foundation",
        url: "https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/",
        publisher: "a2a-protocol.org",
        accessed: AS_OF,
        type: "primary",
        supports: "First-party source of the 150+ orgs / production claim (self-reported)",
      },
    ],
    gaps: [
      "Need the org list or AAIF/LF roster to treat 150 as audited.",
    ],
    as_of: AS_OF,
  };
}

export function goldenNicheBriefAnnotations(): ResearchBriefResult {
  return {
    query:
      "Can an MCP host trust tool annotations (readOnlyHint, destructiveHint) to skip user confirmation? What does the spec actually require?",
    depth: "standard",
    tldr:
      "No. Annotations are a risk vocabulary, not a permission system. Defaults are pessimistic; from an untrusted server they are informational only. Skip confirmation only for servers you already trust, and keep enforcement in the host (consent, sandbox, egress).",
    body: {
      what_annotations_are:
        "Tool annotations shipped in spec revision 2025-03-26. Fields: readOnlyHint (default false), destructiveHint (default true), idempotentHint (default false), openWorldHint (default true). Every property is a hint.",
      trust_rule:
        "Clients MUST treat annotations as untrusted unless the server is trusted. A server can lie (readOnlyHint: true and still delete files).",
      unannotated_defaults:
        "Unannotated tool = assume write, destructive, non-idempotent, open-world.",
      tool_safety:
        "MCP Tool Safety: tool descriptions/annotations are untrusted unless the server is trusted; hosts must get explicit user consent before invoking a tool.",
      real_guarantees:
        "Consent UI, sandbox, and network egress controls — not booleans from the server.",
      recommendation:
        "Do not auto-approve solely on readOnlyHint from a third-party server.",
    },
    confidence: "high",
    sources: [
      {
        title: "MCP Specification 2026-07-28 — Security and Trust & Safety",
        url: "https://modelcontextprotocol.io/specification/2026-07-28",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Annotations untrusted; consent before tool invocation; Tool Safety",
      },
      {
        title: "Tool annotations (MCP blog)",
        url: "https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/",
        publisher: "blog.modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Annotation fields and defaults; risk vocabulary framing",
      },
      {
        title: "MCP Tools (2025-06-18 server/tools)",
        url: "https://modelcontextprotocol.io/specification/2025-06-18/server/tools",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Older tools page; annotations untrusted; field semantics",
      },
      {
        title: "MCP specification repository",
        url: "https://github.com/modelcontextprotocol/modelcontextprotocol",
        publisher: "GitHub / modelcontextprotocol",
        accessed: AS_OF,
        type: "primary",
        supports: "Spec source lineage for annotation revision 2025-03-26",
      },
    ],
    gaps: [],
    as_of: AS_OF,
  };
}

export function goldenNicheLookupTokenPassthrough(): SourceLookupResult {
  return {
    claim_or_url:
      "MCP servers may accept a client’s existing API token and forward it to a downstream API (token passthrough).",
    ask: "Is this allowed?",
    verdict: "found",
    http_status: 200,
    tldr:
      "Found as a forbidden anti-pattern: the claim is false as policy. MCP security best practices explicitly forbid token passthrough — servers MUST NOT accept tokens that were not issued for that MCP server.",
    body: {
      policy: "Token passthrough is explicitly forbidden (MUST NOT).",
      rule: "Servers MUST NOT accept tokens that were not issued for that MCP server.",
      risks_named_on_page: [
        "audience validation failure",
        "confused deputy",
        "broken audit",
        "control circumvention",
      ],
      paraphrase:
        "Accepting a client's existing API token and forwarding it downstream is an anti-pattern, not an allowed integration pattern.",
    },
    confidence: "high",
    sources: [
      {
        title: "MCP Security Best Practices",
        url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "Token passthrough forbidden; MUST NOT; named risks",
      },
    ],
    gaps: [],
    as_of: AS_OF,
  };
}

export function goldenNicheBriefAgentsApi(): ResearchBriefResult {
  return {
    query:
      "How does OpenAI’s Agents API connect to MCP servers, and is it a substitute for us exposing MCP tools?",
    depth: "standard",
    tldr:
      "Agents API is a managed Codex harness (sessions, optional sandbox, tools, MCP, subagents) that can call MCP over HTTP as a first-class tool type. It is a caller/host, not a substitute for exposing our MCP tools — we remain the server; listing/connect docs for that host is distribution.",
    body: {
      what_it_is:
        "Agents API = managed Codex harness: sessions, optional sandbox/environment, tools, MCP, subagents.",
      mcp_integration: {
        tool_type: 'agent.tools entry with type: "mcp"',
        fields: ["server_url (HTTP)", "optional allowed_tools", "optional required"],
        example_docs_mcp: "https://developers.openai.com/mcp",
      },
      session_create: {
        method: "POST",
        url: "https://api.openai.com/v1/agents/sessions",
        header: "OpenAI-Beta: agents=v1",
        note: "Shown in official curl examples on fetched docs.",
      },
      residency_as_of_docs_fetch:
        "Docs page fetched 2026-09-12: US data residency only; not ZDR-eligible (including self-hosted sandbox).",
      recommendation:
        "Not a substitute. Agents API is a caller (host). We remain the server. Treat OpenAI Agents as a distribution surface that speaks MCP.",
      not_an_interop_protocol:
        "Do not treat Agents API as an agent-to-agent interop protocol like A2A.",
      confidence_split: {
        api_shape: "high (fetched first-party docs)",
        launch_day_marketing: "unknown (introducing-the-agents-api page 403 this run)",
      },
    },
    confidence: "high",
    sources: [
      {
        title: "Agents API overview",
        url: "https://developers.openai.com/api/docs/guides/agents-api/overview",
        publisher: "developers.openai.com",
        accessed: AS_OF,
        type: "primary",
        supports: "Harness shape; sessions; tools/MCP/subagents; residency notes",
      },
      {
        title: "Agents API — MCP tools",
        url: "https://developers.openai.com/api/docs/guides/agents-api/tools/mcp",
        publisher: "developers.openai.com",
        accessed: AS_OF,
        type: "primary",
        supports: "type: mcp; server_url; allowed_tools / required",
      },
      {
        title: "OpenAI MCP docs entry",
        url: "https://developers.openai.com/mcp",
        publisher: "developers.openai.com",
        accessed: AS_OF,
        type: "primary",
        supports: "Official MCP connection docs for OpenAI hosts",
      },
      {
        title: "MCP Specification 2026-07-28",
        url: "https://modelcontextprotocol.io/specification/2026-07-28",
        publisher: "modelcontextprotocol.io",
        accessed: AS_OF,
        type: "primary",
        supports: "MCP server role vs host/client — Agents API is a host",
      },
    ],
    gaps: [
      "https://openai.com/index/introducing-the-agents-api/ returned 403 on 2026-09-12 — do not state Sep 10, 2026 launch date as high confidence until that page is fetched.",
    ],
    as_of: AS_OF,
  };
}
