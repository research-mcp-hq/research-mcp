/**
 * Eval pack: run sample-path goldens against the 6-point ship rubric.
 * Usage: npm run eval
 */

import {
  goldenBriefHappy,
  goldenBriefSparse,
  goldenCompareHappy,
  goldenCompareMissing,
  goldenLookupConflicting,
  goldenLookupFound,
  goldenLookupNotFound,
  goldenNicheBriefAgentsApi,
  goldenNicheBriefAnnotations,
  goldenNicheLookupTokenPassthrough,
} from "../src/research/goldens.js";
import {
  resolveBrief,
  resolveCompare,
  resolveLookup,
} from "../src/research/samples.js";
import { mkdirSync, writeFileSync } from "node:fs";
import type {
  CompareOptionsResult,
  Confidence,
  Source,
  SourceLookupResult,
} from "../src/types.js";

type Envelope = {
  tldr: string;
  body: unknown;
  confidence: Confidence;
  sources: Source[];
  gaps: string[];
  as_of: string;
};

interface GoldenCase {
  id: string;
  tool: "research_brief" | "compare_options" | "source_lookup";
  depthBar: "quick" | "standard" | "deep" | "lookup";
  expected: Envelope;
  actual: Envelope & Record<string, unknown>;
  mustInclude: string[];
  mustNot: string[];
  allowedConfidence: Confidence[];
  requireGapsMention?: RegExp[];
}

/** Score content only (exclude echo'd inputs that can false-trigger must-not). */
function answerBlob(actual: Record<string, unknown>): string {
  const { query, options, question, criteria, claim_or_url, ask, ...rest } = actual;
  void query;
  void options;
  void question;
  void criteria;
  void claim_or_url;
  void ask;
  return JSON.stringify(rest).toLowerCase();
}

function densityOk(
  sources: Source[],
  depthBar: GoldenCase["depthBar"],
  tool: GoldenCase["tool"],
  optionCount?: number,
): boolean {
  const uniq = new Set(sources.map((s) => s.url));
  const primaries = sources.filter((s) => s.type === "primary");
  if (tool === "source_lookup") return sources.length >= 1 && primaries.length >= 1;
  if (tool === "compare_options") {
    const n = optionCount ?? 2;
    return uniq.size >= n * 2 && primaries.length >= n;
  }
  if (depthBar === "quick") return uniq.size >= 2 && primaries.length >= 1;
  if (depthBar === "deep") return uniq.size >= 6 && primaries.length >= 3;
  return uniq.size >= 4 && primaries.length >= 2;
}

function scoreCase(c: GoldenCase): { id: string; scores: Record<string, 0 | 1>; pass: boolean } {
  const text = answerBlob(c.actual);

  let fab: 0 | 1 = 1;
  if (c.id.includes("sparse")) {
    fab = !/\$\d/.test(text) && !/\b\d{2,}\s+paying/.test(text) ? 1 : 0;
  } else if (c.id.includes("compare-missing") || c.id.includes("G4")) {
    fab = !/\d+(\.\d+)?\s*%/.test(text) ? 1 : 0;
  } else if (c.id.includes("annotations") || c.id.includes("N1")) {
    fab = !/\bcve-\d/i.test(text) ? 1 : 0;
  }

  const optionCount = Array.isArray((c.actual as CompareOptionsResult).options)
    ? (c.actual as CompareOptionsResult).options.length
    : undefined;

  const density: 0 | 1 = densityOk(c.actual.sources, c.depthBar, c.tool, optionCount) ? 1 : 0;
  const confidenceLegal: 0 | 1 = c.allowedConfidence.includes(c.actual.confidence) ? 1 : 0;
  const mustInclude: 0 | 1 = c.mustInclude.every((m) => text.includes(m.toLowerCase())) ? 1 : 0;
  const mustNot: 0 | 1 = c.mustNot.every((m) => !text.includes(m.toLowerCase())) ? 1 : 0;

  let gapsHonest: 0 | 1 = 1;
  if (c.requireGapsMention?.length) {
    const gapsText = JSON.stringify(c.actual.gaps).toLowerCase() + text;
    gapsHonest = c.requireGapsMention.every((re) => re.test(gapsText)) ? 1 : 0;
  }
  if ((c.expected.gaps?.length ?? 0) > 0 && (c.actual.gaps?.length ?? 0) === 0) {
    gapsHonest = 0;
  }

  // source_lookup: require verdict present
  if (c.tool === "source_lookup") {
    const v = (c.actual as SourceLookupResult).verdict;
    if (!v) {
      return {
        id: c.id,
        scores: {
          no_fabrication: 0,
          density,
          confidence_legal: confidenceLegal,
          must_include: 0,
          must_not: mustNot,
          gaps_honest: gapsHonest,
        },
        pass: false,
      };
    }
  }

  const scores = {
    no_fabrication: fab,
    density,
    confidence_legal: confidenceLegal,
    must_include: mustInclude,
    must_not: mustNot,
    gaps_honest: gapsHonest,
  };
  const pass = Object.values(scores).every((v) => v === 1);
  return { id: c.id, scores, pass };
}

async function buildCases(): Promise<GoldenCase[]> {
  const briefHappy = resolveBrief({
    query:
      "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
    depth: "standard",
  });
  const briefSparse = resolveBrief({
    query:
      "How many paying customers does Smithery have for hosted MCP servers, and what is Hobby plan list price in USD?",
    depth: "standard",
  });
  const compareHappy = resolveCompare({
    options: ["MCP", "A2A"],
    question: "We want other agents to call our research tools. Should we expose MCP, A2A, or both?",
    criteria: ["job_to_be_done", "layer", "governance", "maturity_as_of_2026-09"],
  });
  const compareMissing = resolveCompare({
    options: ["Smithery listing", "Official MCP registry"],
    question: "Where should we list a paid metered research MCP first?",
    criteria: ["listing_cost", "built_in_metering", "reach", "take_rate"],
  });
  const lookupFound = await resolveLookup({
    claim_or_url: "https://www.anthropic.com/news/model-context-protocol",
    ask: "When was MCP announced and who are the named authors?",
  });
  const lookupNotFound = await resolveLookup({
    claim_or_url: "https://modelcontextprotocol.io/specification/2019-01-01",
    ask: "Is there an MCP spec dated 2019-01-01?",
  });
  const lookupConflict = await resolveLookup({
    claim_or_url:
      "A2A is backed by over 150 organizations and runs in production across supply chains, financial services, and mobile.",
    ask: "Verify this claim.",
  });
  const nicheAnnotations = resolveBrief({
    query:
      "Can an MCP host trust tool annotations (readOnlyHint, destructiveHint) to skip user confirmation? What does the spec actually require?",
    depth: "standard",
  });
  const nicheToken = await resolveLookup({
    claim_or_url:
      "MCP servers may accept a client’s existing API token and forward it to a downstream API (token passthrough).",
    ask: "Is this allowed?",
  });
  const nicheAgents = resolveBrief({
    query:
      "How does OpenAI’s Agents API connect to MCP servers, and is it a substitute for us exposing MCP tools?",
    depth: "standard",
  });

  return [
    {
      id: "G1-brief-happy",
      tool: "research_brief",
      depthBar: "standard",
      expected: goldenBriefHappy(),
      actual: briefHappy,
      mustInclude: [
        "json-rpc",
        "2024-11-25",
        "david soria parra",
        "justin spahr-summers",
        "agentic ai foundation",
        "2025-12-09",
        "2026-07-28",
      ],
      mustNot: ["industry standard with 10m installs"],
      allowedConfidence: ["high"],
    },
    {
      id: "G2-brief-sparse",
      tool: "research_brief",
      depthBar: "standard",
      expected: goldenBriefSparse(),
      actual: briefSparse,
      mustInclude: ["hobby", "unknown", "smithery.ai/pricing"],
      mustNot: ["$9/mo", "$29/mo", "exactly 1200 paying"],
      allowedConfidence: ["low", "unknown"],
      requireGapsMention: [/smithery\.ai\/pricing/],
    },
    {
      id: "G3-compare-happy",
      tool: "compare_options",
      depthBar: "standard",
      expected: goldenCompareHappy(),
      actual: compareHappy,
      mustInclude: ["vertical", "horizontal", "complementary", "mcp", "2026-07-28"],
      mustNot: ["single unconditional winner: a2a only"],
      allowedConfidence: ["high", "medium"],
    },
    {
      id: "G4-compare-missing",
      tool: "compare_options",
      depthBar: "standard",
      expected: goldenCompareMissing(),
      actual: compareMissing,
      mustInclude: ["unknown", "take_rate", "first-party"],
      mustNot: ["15% take rate", "20% take rate"],
      allowedConfidence: ["low", "unknown", "medium"],
      requireGapsMention: [/take_rate|marketplace terms/],
    },
    {
      id: "G5-lookup-found",
      tool: "source_lookup",
      depthBar: "lookup",
      expected: goldenLookupFound(),
      actual: lookupFound,
      mustInclude: ["found", "nov 25, 2024", "david soria parra", "justin spahr-summers"],
      mustNot: [],
      allowedConfidence: ["high"],
    },
    {
      id: "G6-lookup-not-found",
      tool: "source_lookup",
      depthBar: "lookup",
      expected: goldenLookupNotFound(),
      actual: lookupNotFound,
      mustInclude: ["not_found", "2026-07-28"],
      mustNot: ["there is an official 2019 mcp spec"],
      allowedConfidence: ["high"],
    },
    {
      id: "G7-lookup-conflicting",
      tool: "source_lookup",
      depthBar: "lookup",
      expected: goldenLookupConflicting(),
      actual: lookupConflict,
      mustInclude: ["150", "a2a-protocol.org", "first-party"],
      mustNot: ["audited census confirms 150", "verified census of 150"],
      allowedConfidence: ["medium"],
      requireGapsMention: [/roster|audited|org list/],
    },
    {
      id: "N1-brief-annotations",
      tool: "research_brief",
      depthBar: "standard",
      expected: goldenNicheBriefAnnotations(),
      actual: nicheAnnotations,
      mustInclude: ["untrusted", "readonlyhint", "destructivehint", "2025-03-26", "consent"],
      mustNot: ["cve-2024", "cve-2025"],
      allowedConfidence: ["high"],
    },
    {
      id: "N2-lookup-token-passthrough",
      tool: "source_lookup",
      depthBar: "lookup",
      expected: goldenNicheLookupTokenPassthrough(),
      actual: nicheToken,
      mustInclude: ["must not", "forbidden", "confused deputy"],
      mustNot: ["merely not recommended"],
      allowedConfidence: ["high"],
    },
    {
      id: "N3-brief-agents-api",
      tool: "research_brief",
      depthBar: "standard",
      expected: goldenNicheBriefAgentsApi(),
      actual: nicheAgents,
      mustInclude: ["agents/sessions", "openai-beta", "type: \\\"mcp\\\"", "not a substitute"],
      mustNot: ["agents api replaces exposing an mcp server"],
      allowedConfidence: ["high", "unknown"],
      requireGapsMention: [/introducing-the-agents-api|403/],
    },
  ];
}

function writeFixtures(cases: GoldenCase[]): void {
  const outDir = new URL("./fixtures/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const c of cases) {
    const payload = {
      id: c.id,
      tool: c.tool,
      depthBar: c.depthBar,
      mustInclude: c.mustInclude,
      mustNot: c.mustNot,
      allowedConfidence: c.allowedConfidence,
      sample_output: c.actual,
      reference_expected: c.expected,
    };
    writeFileSync(
      new URL(`${c.id}.json`, outDir),
      JSON.stringify(payload, null, 2) + "\n",
      "utf8",
    );
  }
  writeFileSync(
    new URL("README.md", outDir),
    [
      "# Golden fixture dumps",
      "",
      "Regenerated by `npm run eval`. Each file is one golden for Research review:",
      "",
      "- `sample_output` — what the sample path returns today",
      "- `reference_expected` — frozen golden envelope from `src/research/goldens.ts`",
      "- rubric fields — mustInclude / mustNot / allowedConfidence",
      "",
      "Ship bar: every golden must score **6/6** (see repo root `quality-bars.md`).",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function main(): Promise<void> {
  const cases = await buildCases();
  writeFixtures(cases);
  const results = cases.map(scoreCase);
  let failed = 0;
  for (const r of results) {
    const total = Object.values(r.scores).reduce((a, b) => a + b, 0);
    process.stdout.write(
      JSON.stringify({
        type: "eval",
        id: r.id,
        score: `${total}/6`,
        pass: r.pass,
        scores: r.scores,
      }) + "\n",
    );
    if (!r.pass) failed += 1;
  }
  process.stdout.write(
    JSON.stringify({
      type: "eval_summary",
      total: results.length,
      passed: results.length - failed,
      failed,
      ship_bar: failed === 0,
      fixtures_dir: "evals/fixtures",
    }) + "\n",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
