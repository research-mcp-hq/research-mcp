/**
 * Live brief pipeline tests — MockProvider only, no network, no vendor keys.
 * Run: npm run test:pipeline
 * P2: quote gate — billable only when density OK && quotes verify against pages.
 */
import assert from "node:assert/strict";
import { applyChargeGate } from "../src/usage.js";
import {
  briefPathMayBeBillable,
  runResearchBrief,
} from "../src/research/index.js";
import { runLiveBriefPipeline } from "../src/research/pipeline.js";
import {
  PIPELINE_PHASES,
  type PipelinePhase,
} from "../src/research/progress.js";
import { briefBarPassing, briefDensityOk } from "../src/research/bar.js";
import { DEFAULT_COGS, loadCogsConfig, type CogsConfig } from "../src/research/cogs.js";
import { defaultMockPages, MockProvider } from "../src/research/providers/mock.js";
import { LocalHttpProvider } from "../src/research/providers/local.js";
import {
  buildClaimsFromPages,
  classifySourceType,
  synthesizeBrief,
} from "../src/research/synthesize.js";
import {
  claimTiedToQuery,
  meaningfulTokens,
  normalizeForQuoteMatch,
  quoteInPages,
  verifyQuotes,
} from "../src/research/quote-gate.js";
import type {
  ExtractedPage,
  SynthesizeInput,
  SynthesizeOutput,
} from "../src/research/providers/types.js";

const OFF_GOLDEN = "Purple widgets Q3 2026 decision brief for a paid research SKU";
const GOLDEN_Q =
  "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`FAIL - ${name}\n`);
    process.stdout.write(
      `  ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
  }
}

function overCapCogs(): CogsConfig {
  return {
    ...DEFAULT_COGS,
    capCentsStandard: 10,
    capCentsQuick: 10,
    searchUnitCents: 100,
    extractUnitCents: 50,
    synthesizeUnitCents: 0,
  };
}

await test("mock quoted synth: quotes match pages → billable true when density ok", async () => {
  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("unexpected live fetch");
  }) as typeof fetch;
  try {
    const provider = new MockProvider({ pages: defaultMockPages(OFF_GOLDEN) });
    const r = await runResearchBrief(
      { query: OFF_GOLDEN, depth: "standard" },
      { provider, cogs: loadCogsConfig() },
    );
    assert.equal(r.meta?.mode, "live");
    assert.equal(r.meta?.billable, true);
    assert.ok(briefDensityOk(r.sources, "standard"));
    assert.ok(briefBarPassing(r.sources, "standard", r.confidence));
    const body = r.body as {
      density_confidence_ok?: boolean;
      quotes_verified?: boolean;
      synthesizer?: string;
      claims?: unknown[];
    };
    assert.equal(body.density_confidence_ok, true);
    assert.equal(body.quotes_verified, true);
    assert.equal(body.synthesizer, "local-quoted-v1");
    assert.ok(Array.isArray(body.claims) && body.claims.length >= 2);
    const uniq = new Set(r.sources.map((s) => s.url));
    assert.ok(uniq.size >= 4, `unique sources ${uniq.size}`);
    const primaries = r.sources.filter((s) => s.type === "primary");
    assert.ok(primaries.length >= 2, `primaries ${primaries.length}`);
    const allowed = new Set(defaultMockPages(OFF_GOLDEN).map((p) => p.url));
    for (const s of r.sources) {
      assert.ok(allowed.has(s.url), `invented url ${s.url}`);
    }
    assert.equal(provider.id, "mock");
    assert.ok(provider.searchCalls >= 1);
    assert.ok(provider.extractCalls >= 4);
    assert.equal(fetchCalled, false);
    const gate = applyChargeGate("research_brief", "standard", r.meta);
    assert.equal(gate.billable, true);
    assert.equal(gate.charge_usd, 0.6);
    assert.equal(gate.mode, "live");
  } finally {
    globalThis.fetch = origFetch;
  }
});

await test("claim with quote not in pages → billable false", async () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const provider = new MockProvider({
    pages,
    // custom synthesize that invents a quote not present in any page
  });
  // Monkey-patch synthesize on the instance
  (provider as MockProvider & { synthesize: (i: SynthesizeInput) => Promise<SynthesizeOutput> }).synthesize =
    async (input) => {
      const base = synthesizeBrief(input);
      return {
        ...base,
        // Replace claims with one that has a fabricated quote
        claims: [
          {
            claim: "Invented assertion about purple widgets revenue",
            quote:
              "Purple widgets generated exactly nine hundred million dollars in Q3 2099.",
            source_url: pages[0]!.url,
          },
        ],
        body: {
          ...(base.body as object),
          synthesizer: "custom-non-extractive",
          claims: [
            {
              claim: "Invented assertion about purple widgets revenue",
              quote:
                "Purple widgets generated exactly nine hundred million dollars in Q3 2099.",
              source_url: pages[0]!.url,
            },
          ],
        },
      };
    };

  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, false);
  assert.equal(r.confidence, "unknown");
  const body = r.body as { quotes_verified?: boolean; synthesizer?: string };
  assert.equal(body.quotes_verified, false);
  // Label is non-extractive — still must fail closed without quote∈page
  assert.equal(body.synthesizer, "custom-non-extractive");
  assert.ok(r.gaps.some((g) => /quote gate|not found in extracted/i.test(g)));
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("custom synth without claims (non-extractive label) → fail closed $0", async () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const provider = new MockProvider({ pages });
  (provider as MockProvider & { synthesize: (i: SynthesizeInput) => Promise<SynthesizeOutput> }).synthesize =
    async (input) => {
      const base = synthesizeBrief(input);
      return {
        ...base,
        claims: [], // no quotes attached
        confidence: "high",
        body: {
          ...(base.body as object),
          synthesizer: "fancy-llm-looking-v9",
          claims: [],
        },
      };
    };

  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  // MUST: !isExtractive alone must NOT unlock billing
  assert.equal(r.meta?.billable, false);
  assert.equal(r.confidence, "unknown");
  const body = r.body as { quotes_verified?: boolean; synthesizer?: string };
  assert.equal(body.quotes_verified, false);
  assert.equal(body.synthesizer, "fancy-llm-looking-v9");
  assert.ok(r.gaps.some((g) => /quote gate|no load-bearing/i.test(g)));
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("COGS over-cap → not billable, no provider calls", async () => {
  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("unexpected live fetch");
  }) as typeof fetch;
  try {
    const provider = new MockProvider();
    const r = await runResearchBrief(
      { query: OFF_GOLDEN, depth: "standard" },
      { provider, cogs: overCapCogs() },
    );
    assert.equal(r.meta?.mode, "live");
    assert.equal(r.meta?.billable, false);
    assert.equal(r.confidence, "unknown");
    assert.equal(r.sources.length, 0);
    const body = r.body as { cogs_abort?: boolean };
    assert.equal(body.cogs_abort, true);
    assert.ok(r.gaps.some((g) => /cogs|cap/i.test(g)));
    assert.equal(provider.searchCalls, 0);
    assert.equal(provider.extractCalls, 0);
    assert.equal(fetchCalled, false);
    const gate = applyChargeGate("research_brief", "standard", r.meta);
    assert.equal(gate.billable, false);
    assert.equal(gate.charge_usd, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

await test("goldens still win over injected mock provider", async () => {
  const provider = new MockProvider();
  const r = await runResearchBrief(
    { query: GOLDEN_Q, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "golden");
  assert.equal(r.meta?.billable, true);
  assert.equal(provider.searchCalls, 0);
  assert.equal(provider.extractCalls, 0);
});

await test("pipeline failure (empty search) → sample fallback", async () => {
  const provider = new MockProvider({
    pages: [],
    searchImpl: async () => [],
  });
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "sample");
  assert.equal(r.meta?.billable, false);
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.charge_usd, 0);
});

await test("thin extract fails density → live but not billable", async () => {
  const thin: ExtractedPage[] = [
    {
      url: "https://roundup.blog.example/one-page",
      title: "One secondary page",
      publisher: "Roundup Blog",
      date: "2026-05-10",
      text: "A single secondary page about purple widgets published 2026-05-10. ".repeat(8),
    },
  ];
  const provider = new MockProvider({ pages: thin });
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, false);
  assert.ok(
    r.gaps.some((g) => /density|not charged|billable=false|quote gate/i.test(g)),
  );
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("deep does not use pipeline even with mock provider", async () => {
  const provider = new MockProvider();
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "deep" },
    { provider },
  );
  assert.equal(r.meta?.mode, "sample");
  assert.equal(r.meta?.billable, false);
  assert.equal(provider.searchCalls, 0);
});

await test("no provider + LIVE_RESEARCH off → sample (off-golden standard)", async () => {
  const prev = process.env.LIVE_RESEARCH;
  delete process.env.LIVE_RESEARCH;
  try {
    const r = await runResearchBrief({ query: OFF_GOLDEN, depth: "standard" });
    assert.equal(r.meta?.mode, "sample");
    assert.equal(r.meta?.billable, false);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "standard"), false);
  } finally {
    if (prev === undefined) delete process.env.LIVE_RESEARCH;
    else process.env.LIVE_RESEARCH = prev;
  }
});

await test("quick mock quoted: density+quotes → billable", async () => {
  const provider = new MockProvider({ pages: defaultMockPages(OFF_GOLDEN) });
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "quick" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, true);
  assert.ok(briefDensityOk(r.sources, "quick"));
  assert.ok(briefBarPassing(r.sources, "quick", r.confidence));
  const body = r.body as { quotes_verified?: boolean };
  assert.equal(body.quotes_verified, true);
  const gate = applyChargeGate("research_brief", "quick", r.meta);
  assert.equal(gate.billable, true);
  assert.equal(gate.charge_usd, 0.25);
});

await test("quote helpers: normalize + substring match (source_url required)", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const sentence =
    "Official specification published 2026-03-15. Defines roles, transports, and versioning.";
  const url = pages[0]!.url;
  assert.equal(quoteInPages(sentence, pages), false); // unbound → false
  assert.ok(quoteInPages(sentence, pages, url));
  assert.ok(
    quoteInPages(
      "  Official   SPECIFICATION published 2026-03-15. Defines roles, transports, and versioning. ",
      pages,
      url,
    ),
  );
  assert.equal(
    quoteInPages(
      "This quote appears nowhere in any mock page text at all forever.",
      pages,
      url,
    ),
    false,
  );
  // Empty query → fail closed
  const emptyQ = verifyQuotes(
    [{ claim: "Purple widgets research SKU", quote: sentence, source_url: url }],
    pages,
  );
  assert.equal(emptyQ.ok, false);
  assert.ok(emptyQ.gaps.some((g) => /empty query/i.test(g)));
  // Sentence must also be query-tied; use a purple-widgets line from mock page text
  const tiedSentence =
    pages[0]!.text.split(/(?<=[.!?])\s+/).find((s) => /purple|widget|sku|research/i.test(s)) ??
    sentence;
  const v = verifyQuotes(
    [
      {
        claim: "Purple widgets research SKU decision needs a cited brief",
        quote: tiedSentence,
        source_url: url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(v.ok, true, v.gaps.join("; "));
  const wrongUrl = verifyQuotes(
    [
      {
        claim: "Purple widgets research SKU decision needs a cited brief",
        quote: tiedSentence,
        source_url: pages[1]!.url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(wrongUrl.ok, false);
  const miss = verifyQuotes(
    [
      {
        claim: "Purple widgets research SKU bad claim",
        quote: "Completely fabricated sentence that is long enough to gate but absent.",
        source_url: url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(miss.ok, false);
  assert.equal(miss.confidenceFloor, "unknown");
});

await test("classifySourceType: allowlist primaries; arbitrary github/docs secondary", () => {
  assert.equal(
    classifySourceType("https://modelcontextprotocol.io/specification/2026-07-28"),
    "primary",
  );
  assert.equal(
    classifySourceType("https://www.anthropic.com/news/model-context-protocol"),
    "primary",
  );
  assert.equal(
    classifySourceType("https://a2a-protocol.org/latest/specification/"),
    "primary",
  );
  assert.equal(
    classifySourceType(
      "https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation",
    ),
    "primary",
  );
  assert.equal(
    classifySourceType("https://developers.openai.com/api/docs/guides/agents-api/overview"),
    "primary",
  );
  assert.equal(
    classifySourceType("https://github.com/modelcontextprotocol/modelcontextprotocol"),
    "primary",
  );
  assert.equal(classifySourceType("https://github.com/a2aproject/A2A"), "primary");
  // MUST 2: not primary
  assert.equal(classifySourceType("https://github.com/example/topic"), "secondary");
  assert.equal(classifySourceType("https://example.com/docs/topic/overview"), "secondary");
  assert.equal(classifySourceType("https://docs.example.com/topic/specification"), "secondary");
  assert.equal(classifySourceType("https://www.example.com/press/topic-2026"), "secondary");
  assert.equal(classifySourceType("https://roundup.blog.example/topic-q3"), "secondary");
  assert.equal(classifySourceType("https://www.anthropic.com/company"), "secondary");
});

await test("LocalHttpProvider uses injected fetch only (no vendor)", async () => {
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const u = String(input);
    calls.push(u);
    if (u.includes("duckduckgo")) {
      const html =
        '<a class="result__a" href="https://docs.example.com/injected">Doc</a>';
      return new Response(html, { status: 200 });
    }
    const page =
      "<html><head><title>Injected spec</title></head><body>" +
      "<p>Injected specification published 2026-03-15. ".repeat(10) +
      "</p></body></html>";
    return new Response(page, { status: 200 });
  };
  const provider = new LocalHttpProvider(fetchFn);
  const urls = await provider.search("injected topic");
  assert.ok(urls.some((u) => u.includes("docs.example.com")));
  const page = await provider.fetchExtract(urls[0]!);
  assert.equal(page.title, "Injected spec");
  assert.ok(page.text.includes("specification"));
  assert.ok(calls.every((c) => !/parallel\.ai|exa\.ai|tavily/i.test(c)));
  assert.equal(provider.id, "local-http");
});

await test("runLiveBriefPipeline COGS abort does not search", async () => {
  const provider = new MockProvider();
  const r = await runLiveBriefPipeline(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider, cogs: overCapCogs() },
  );
  assert.ok(r);
  assert.equal(r!.meta?.billable, false);
  assert.equal(provider.searchCalls, 0);
});

await test("LIVE_RESEARCH=1: soft-reserve may bill (quote gate path)", () => {
  const prev = process.env.LIVE_RESEARCH;
  process.env.LIVE_RESEARCH = "1";
  try {
    // Path may be billable after density+quote verify → soft-reserve full SKU
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "standard"), true);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "quick"), true);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "deep"), false);
    // Goldens still bill at authored depth
    assert.equal(briefPathMayBeBillable(GOLDEN_Q, "standard"), true);
    assert.equal(briefPathMayBeBillable(GOLDEN_Q, "deep"), false);
  } finally {
    if (prev === undefined) delete process.env.LIVE_RESEARCH;
    else process.env.LIVE_RESEARCH = prev;
  }
});

await test("LIVE_RESEARCH off: soft-reserve 0 for off-golden", () => {
  const prev = process.env.LIVE_RESEARCH;
  delete process.env.LIVE_RESEARCH;
  try {
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "standard"), false);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "quick"), false);
  } finally {
    if (prev === undefined) delete process.env.LIVE_RESEARCH;
    else process.env.LIVE_RESEARCH = prev;
  }
});

await test("MUST1: quote on wrong source_url fails even if text exists elsewhere", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  // Sentence lives on pages[0]; claim attributes it to pages[1]
  const quote =
    "Official specification published 2026-03-15. Defines roles, transports, and versioning.";
  // Prefer a quote that is unique to page 0 — use exact page-0 lead sentence fragment present only there after bind
  const page0Only =
    "Official specification published 2026-03-15. Defines roles, transports, and versioning.";
  assert.ok(quoteInPages(page0Only, pages, pages[0]!.url));
  assert.equal(
    quoteInPages(page0Only, pages, pages[1]!.url),
    false,
    "must not fall back to another page when source_url is set",
  );
  const v = verifyQuotes(
    [{ claim: "spec roles", quote: page0Only, source_url: pages[1]!.url }],
    pages,
    { query: OFF_GOLDEN },
  );
  // Also fails query-tie (page0Only lacks purple/widgets…); assert source bind message path separately:
  const vBind = verifyQuotes(
    [
      {
        claim: `Purple widgets research: ${page0Only}`,
        quote: page0Only,
        source_url: pages[1]!.url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(vBind.ok, false);
  assert.ok(
    vBind.gaps.some((g) => /source_url|No cross-page fallback|not found in source_url/i.test(g)),
  );
  void quote;
  void v;
});

await test("MUST1: missing source page → fail", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const quote =
    "Official specification query context for Purple widgets Q3 2026 decision brief for a paid research SKU.";
  const miss = verifyQuotes(
    [
      {
        claim: "Purple widgets paid research brief from a missing page",
        quote,
        source_url: "https://never-fetched.example/missing",
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(miss.ok, false);
  assert.ok(miss.gaps.some((g) => /not in extracted pages|source_url/i.test(g)));
});

await test("MUST: empty source_url fails (no unbound any-page match)", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const quote =
    pages[0]!.text.match(/[^.!?]+[.!?]/)?.[0]?.trim() ?? pages[0]!.text.slice(0, 120);
  const miss = verifyQuotes(
    [
      {
        claim: "Model Context Protocol hosts talk to servers",
        quote,
        source_url: "",
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(miss.ok, false);
  assert.ok(
    miss.gaps.some((g) => /missing source_url|Unbound any-page/i.test(g)),
    miss.gaps.join("; "),
  );
});

await test("MUST2: query-irrelevant homepage sentences → not billable", async () => {
  const homepage: ExtractedPage[] = [
    {
      url: "https://modelcontextprotocol.io/",
      title: "Homepage",
      publisher: "MCP",
      date: "2026-01-01",
      text:
        "Welcome to our site. Learn more about our products and company mission today. " +
        "Contact sales for enterprise pricing and onboarding schedules. ".repeat(6),
    },
    {
      url: "https://www.anthropic.com/news/welcome",
      title: "Welcome press",
      publisher: "Anthropic",
      date: "2026-01-02",
      text:
        "Welcome to the newsroom. Browse announcements and company updates here. " +
        "Subscribe for product notes and event calendars each quarter. ".repeat(6),
    },
    {
      url: "https://github.com/modelcontextprotocol/welcome",
      title: "Org welcome",
      publisher: "GitHub",
      date: "2026-01-03",
      text:
        "Organization profile page. Explore repositories and community guidelines. " +
        "Read contributing docs before opening issues or pull requests. ".repeat(6),
    },
    {
      url: "https://a2a-protocol.org/",
      title: "A2A home",
      publisher: "a2a",
      date: "2026-01-04",
      text:
        "Home page hero copy about open protocols for agents in general. " +
        "Join the mailing list for release notes and workshop invitations. ".repeat(6),
    },
  ];
  const claims = buildClaimsFromPages(homepage, OFF_GOLDEN);
  assert.equal(claims.length, 0, "no query-tied claims from generic homepage sentences");
  const provider = new MockProvider({ pages: homepage });
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, false);
  assert.ok(
    r.gaps.some((g) => /query-tied|quote gate|query token/i.test(g)),
  );
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("MUST2: query-tied mock with matching quote on correct URL + density → billable", async () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const claims = buildClaimsFromPages(pages, OFF_GOLDEN);
  assert.ok(claims.length >= 2, `expected query-tied claims, got ${claims.length}`);
  for (const c of claims) {
    assert.ok(claimTiedToQuery(OFF_GOLDEN, c.claim, c.quote));
    assert.ok(quoteInPages(c.quote, pages, c.source_url));
    assert.ok(meaningfulTokens(OFF_GOLDEN).length >= 3);
  }
  const provider = new MockProvider({ pages });
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, true);
  const body = r.body as { quotes_verified?: boolean; synthesizer?: string };
  assert.equal(body.quotes_verified, true);
  assert.equal(body.synthesizer, "local-quoted-v1");
  const gate = applyChargeGate("research_brief", "standard", r.meta);
  assert.equal(gate.billable, true);
  assert.equal(gate.charge_usd, 0.6);
});

await test("quote helpers: source_url bind + normalize", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  const tied =
    "Official specification query context for Purple widgets Q3 2026 decision brief for a paid research SKU.";
  assert.ok(quoteInPages(tied, pages, pages[0]!.url));
  assert.equal(
    quoteInPages(tied, pages, "https://missing.example/x"),
    false,
  );
  assert.equal(normalizeForQuoteMatch("  A  B\nC  "), "a b c");
  const v = verifyQuotes(
    [
      {
        claim: "Purple widgets paid research decision brief",
        quote: tied,
        source_url: pages[0]!.url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(v.ok, true);
  const miss = verifyQuotes(
    [
      {
        claim: "bad",
        quote: "Completely fabricated sentence that is long enough to gate but absent.",
        source_url: pages[0]!.url,
      },
    ],
    pages,
    { query: OFF_GOLDEN },
  );
  assert.equal(miss.ok, false);
  assert.equal(miss.confidenceFloor, "unknown");
});


await test("P3a: phase-only progress searching→extracting→verifying (no pre-verify counts)", async () => {
  const phases: PipelinePhase[] = [];
  const provider = new MockProvider({ pages: defaultMockPages(OFF_GOLDEN) });
  const r = await runLiveBriefPipeline(
    { query: OFF_GOLDEN, depth: "standard" },
    {
      provider,
      onProgress: (phase) => {
        phases.push(phase);
      },
    },
  );
  assert.ok(r);
  assert.equal(r!.meta?.mode, "live");
  assert.deepEqual(phases, [...PIPELINE_PHASES]);
  // Honesty: never report "found N primaries" style messages — only phase names.
  for (const p of phases) {
    assert.ok(["searching", "extracting", "verifying"].includes(p));
  }
});

await test("P3a: abort mid-extract → non-billable cancel, no further extracts", async () => {
  const ctrl = new AbortController();
  let extractAttempts = 0;
  const provider = new MockProvider({
    pages: defaultMockPages(OFF_GOLDEN),
    extractImpl: async (url, opts) => {
      extractAttempts += 1;
      if (extractAttempts === 1) {
        // Abort after first extract starts — mid-pipeline cancel.
        ctrl.abort();
      }
      if (opts?.signal?.aborted || ctrl.signal.aborted) {
        const err = new Error("aborted mid-extract");
        err.name = "AbortError";
        throw err;
      }
      const page = defaultMockPages(OFF_GOLDEN).find((p) => p.url === url);
      if (!page) throw new Error("miss");
      return { ...page, fetch_source: "live" as const };
    },
  });

  const r = await runLiveBriefPipeline(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider, signal: ctrl.signal },
  );
  assert.ok(r);
  assert.equal(r!.meta?.mode, "live");
  assert.equal(r!.meta?.billable, false);
  const body = r!.body as { cancelled?: boolean; cancel_phase?: string };
  assert.equal(body.cancelled, true);
  assert.equal(body.cancel_phase, "extracting");
  assert.ok(r!.gaps.some((g) => /cancelled/i.test(g)));
  // Must not continue extracting the full candidate set after abort.
  assert.ok(extractAttempts <= 2, `extractAttempts=${extractAttempts}`);
  const gate = applyChargeGate("research_brief", "standard", r!.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("P3a: abort before search → cancelled, zero provider spend", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const provider = new MockProvider({ pages: defaultMockPages(OFF_GOLDEN) });
  const r = await runLiveBriefPipeline(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider, signal: ctrl.signal },
  );
  assert.ok(r);
  assert.equal(r!.meta?.billable, false);
  const body = r!.body as { cancelled?: boolean };
  assert.equal(body.cancelled, true);
  assert.equal(provider.searchCalls, 0);
  assert.equal(provider.extractCalls, 0);
  const gate = applyChargeGate("research_brief", "standard", r!.meta);
  assert.equal(gate.charge_usd, 0);
});

await test("P3a: abort mid-search → cancelled non-billable", async () => {
  const ctrl = new AbortController();
  const provider = new MockProvider({
    pages: defaultMockPages(OFF_GOLDEN),
    searchImpl: async (_q, opts) => {
      ctrl.abort();
      if (opts?.signal?.aborted) {
        const err = new Error("search aborted");
        err.name = "AbortError";
        throw err;
      }
      return defaultMockPages(OFF_GOLDEN).map((p) => p.url);
    },
  });
  const r = await runLiveBriefPipeline(
    { query: OFF_GOLDEN, depth: "standard" },
    { provider, signal: ctrl.signal },
  );
  assert.ok(r);
  assert.equal(r!.meta?.billable, false);
  const body = r!.body as { cancelled?: boolean; cancel_phase?: string };
  assert.equal(body.cancelled, true);
  assert.equal(body.cancel_phase, "searching");
  assert.equal(provider.extractCalls, 0);
});

process.stdout.write(`\npipeline tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
