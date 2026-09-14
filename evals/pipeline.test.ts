/**
 * Live brief pipeline tests — MockProvider only, no network, no vendor keys.
 * Run: npm run test:pipeline
 */
import assert from "node:assert/strict";
import { applyChargeGate } from "../src/usage.js";
import {
  briefPathMayBeBillable,
  runResearchBrief,
} from "../src/research/index.js";
import { runLiveBriefPipeline } from "../src/research/pipeline.js";
import { briefBarPassing, briefDensityOk } from "../src/research/bar.js";
import { DEFAULT_COGS, loadCogsConfig, type CogsConfig } from "../src/research/cogs.js";
import { defaultMockPages, MockProvider } from "../src/research/providers/mock.js";
import { LocalHttpProvider } from "../src/research/providers/local.js";
import { classifySourceType } from "../src/research/synthesize.js";
import type { ExtractedPage } from "../src/research/providers/types.js";

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

await test("mock extractive live: density scaffolding passes but billable===false", async () => {
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
    // MUST 1: extractive v0 never bills customers
    assert.equal(r.meta?.billable, false);
    assert.equal(r.confidence, "medium");
    assert.ok(briefDensityOk(r.sources, "standard"));
    assert.ok(briefBarPassing(r.sources, "standard", r.confidence));
    const body = r.body as { density_confidence_ok?: boolean; synthesizer?: string };
    assert.equal(body.density_confidence_ok, true);
    assert.equal(body.synthesizer, "local-extractive-v0");
    const uniq = new Set(r.sources.map((s) => s.url));
    assert.ok(uniq.size >= 4, `unique sources ${uniq.size}`);
    const primaries = r.sources.filter((s) => s.type === "primary");
    assert.ok(primaries.length >= 2, `primaries ${primaries.length}`);
    const allowed = new Set(defaultMockPages(OFF_GOLDEN).map((p) => p.url));
    for (const s of r.sources) {
      assert.ok(allowed.has(s.url), `invented url ${s.url}`);
    }
    assert.ok(
      r.gaps.some((g) => /extractive|quote gate|not decision-ready/i.test(g)),
    );
    assert.equal(provider.id, "mock");
    assert.ok(provider.searchCalls >= 1);
    assert.ok(provider.extractCalls >= 4);
    assert.equal(fetchCalled, false);
    const gate = applyChargeGate("research_brief", "standard", r.meta);
    assert.equal(gate.billable, false);
    assert.equal(gate.charge_usd, 0);
    assert.equal(gate.mode, "live");
  } finally {
    globalThis.fetch = origFetch;
  }
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
    r.gaps.some((g) => /density|not charged|billable=false/i.test(g)),
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

await test("quick mock extractive: density scaffolding ok but not billable", async () => {
  const provider = new MockProvider();
  const r = await runResearchBrief(
    { query: OFF_GOLDEN, depth: "quick" },
    { provider },
  );
  assert.equal(r.meta?.mode, "live");
  assert.equal(r.meta?.billable, false);
  assert.ok(briefDensityOk(r.sources, "quick"));
  assert.ok(briefBarPassing(r.sources, "quick", r.confidence));
  const gate = applyChargeGate("research_brief", "quick", r.meta);
  assert.equal(gate.billable, false);
  assert.equal(gate.charge_usd, 0);
});

await test("density helper can pass without flipping billable (scaffold only)", () => {
  const pages = defaultMockPages(OFF_GOLDEN);
  // Simulate sources via classifySourceType on allowlisted mock URLs
  const sources = pages.map((p) => ({
    title: p.title,
    url: p.url,
    publisher: p.publisher ?? "x",
    accessed: "2026-09-12",
    type: classifySourceType(p.url),
    supports: "test",
  }));
  assert.ok(briefDensityOk(sources, "standard"));
  assert.ok(briefBarPassing(sources, "standard", "medium"));
  // Pipeline is the only place that sets meta.billable; helper does not bill.
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

await test("LIVE_RESEARCH=1 extractive: soft-reserve 0 (not precheck-eligible)", () => {
  const prev = process.env.LIVE_RESEARCH;
  process.env.LIVE_RESEARCH = "1";
  try {
    // Extractive never bills → do not demand full SKU soft-reserve/precheck
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "standard"), false);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "quick"), false);
    assert.equal(briefPathMayBeBillable(OFF_GOLDEN, "deep"), false);
    // Goldens still bill at authored depth
    assert.equal(briefPathMayBeBillable(GOLDEN_Q, "standard"), true);
    assert.equal(briefPathMayBeBillable(GOLDEN_Q, "deep"), false);
  } finally {
    if (prev === undefined) delete process.env.LIVE_RESEARCH;
    else process.env.LIVE_RESEARCH = prev;
  }
});

process.stdout.write(`\npipeline tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
