/**
 * Off-golden evals: no invented HTTP status / found without fetch.
 * Uses injectable fetch — CI does not need network.
 * Usage: npm run eval:off
 */

import {
  briefPathMayBeBillable,
  lookupPathMayBeBillable,
  resolveBrief,
  resolveCompare,
  resolveLookup,
} from "../src/research/samples.js";
import { applyChargeGate } from "../src/usage.js";
import type { FetchFn, SearchFn } from "../src/types.js";

interface CaseResult {
  id: string;
  pass: boolean;
  detail: string;
}

function mockResponse(status: number, body = "ok"): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function runCases(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  // 1. Off-golden random URL with mocked 404 → search replacement attempted; still not_found
  {
    let fetchCalls = 0;
    let searchCalls = 0;
    const fetch404: FetchFn = async () => {
      fetchCalls += 1;
      return mockResponse(404, "Not Found");
    };
    const searchEmpty: SearchFn = async () => {
      searchCalls += 1;
      return [];
    };
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-random-404-path",
        ask: "Does this page exist?",
      },
      { fetch: fetch404, search: searchEmpty },
    );
    const pass =
      fetchCalls >= 1 &&
      searchCalls >= 1 &&
      r.verdict === "not_found" &&
      r.http_status === 404 &&
      r.meta?.mode === "live" &&
      r.meta?.billable === false &&
      r.gaps.some((g) => /replacement search/i.test(g));
    results.push({
      id: "OG1-mocked-404",
      pass,
      detail: pass
        ? `fetchCalls=${fetchCalls} searchCalls=${searchCalls} status=404 (from mock)`
        : `expected live 404 after fetch+search; got verdict=${r.verdict} status=${r.http_status} fetches=${fetchCalls} searches=${searchCalls} meta=${JSON.stringify(r.meta)} gaps=${JSON.stringify(r.gaps)}`,
    });
  }

  // 2. Off-golden URL where fetch fails (no HTTP response) → must not invent http_status 404
  {
    let fetchCalls = 0;
    const fetchFail: FetchFn = async () => {
      fetchCalls += 1;
      throw new Error("network down");
    };
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-unreachable",
        ask: "Anything?",
      },
      { fetch: fetchFail, search: async () => [] },
    );
    const pass =
      fetchCalls >= 1 &&
      r.http_status === null &&
      r.http_status !== 404 &&
      r.confidence === "unknown" &&
      r.verdict === "blocked";
    results.push({
      id: "OG2-no-response-no-invented-404",
      pass,
      detail: pass
        ? `http_status=null after failed fetch (not invented 404)`
        : `expected null status; got status=${r.http_status} verdict=${r.verdict} fetches=${fetchCalls}`,
    });
  }

  // 3. Off-golden non-URL claim → verdict !== found; confidence unknown/unaudited
  {
    let fetchCalls = 0;
    const spyFetch: FetchFn = async () => {
      fetchCalls += 1;
      return mockResponse(200, "should not be called");
    };
    const r = await resolveLookup(
      {
        claim_or_url: "Some random unverified claim about widgets in 2099",
        ask: "Is this true?",
      },
      { fetch: spyFetch },
    );
    const pass =
      fetchCalls === 0 &&
      r.verdict !== "found" &&
      r.verdict === "unaudited" &&
      r.confidence === "unknown" &&
      r.http_status === null &&
      r.meta?.billable === false &&
      r.sources.length === 0 &&
      lookupPathMayBeBillable("Some random unverified claim about widgets in 2099") ===
        false;
    results.push({
      id: "OG3-non-url-unaudited",
      pass,
      detail: pass
        ? `verdict=unaudited confidence=unknown soft-reserve=0`
        : `expected unaudited; got verdict=${r.verdict} conf=${r.confidence} fetches=${fetchCalls} sources=${r.sources.length}`,
    });
  }

  // 4. Mocked 403 → verdict blocked, not not_found
  {
    const fetch403: FetchFn = async () => mockResponse(403, "Forbidden");
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-forbidden",
        ask: "Can we read this?",
      },
      { fetch: fetch403, search: async () => [] },
    );
    const pass =
      r.verdict === "blocked" &&
      r.verdict !== "not_found" &&
      r.http_status === 403 &&
      r.meta?.billable === false;
    results.push({
      id: "OG4-mocked-403-blocked",
      pass,
      detail: pass
        ? `verdict=blocked status=403`
        : `expected blocked/403; got verdict=${r.verdict} status=${r.http_status}`,
    });
  }

  // 5. genericBrief / genericCompare → mode sample + billable false
  {
    const brief = resolveBrief({
      query: "Completely off-golden topic about purple widgets Q3",
      depth: "standard",
    });
    const compare = resolveCompare({
      options: ["AlphaWidget", "BetaWidget"],
      question: "Which purple widget vendor for Q3?",
      criteria: ["price", "support"],
    });
    const bodyBrief = brief.body as { mode?: string; billable?: boolean };
    const bodyCompare = compare.body as { mode?: string; billable?: boolean };
    const pass =
      bodyBrief.mode === "sample" &&
      bodyBrief.billable === false &&
      brief.meta?.mode === "sample" &&
      brief.meta?.billable === false &&
      bodyCompare.mode === "sample" &&
      bodyCompare.billable === false &&
      compare.meta?.mode === "sample" &&
      compare.meta?.billable === false &&
      brief.gaps.some((g) => /not charged/i.test(g)) &&
      compare.gaps.some((g) => /not charged/i.test(g)) &&
      briefPathMayBeBillable(
        "Completely off-golden topic about purple widgets Q3",
        "standard",
      ) === false;
    results.push({
      id: "OG5-generic-brief-compare-sample",
      pass,
      detail: pass
        ? `brief+compare mode=sample billable=false`
        : `brief meta=${JSON.stringify(brief.meta)} body.mode=${bodyBrief.mode}; compare meta=${JSON.stringify(compare.meta)}`,
    });
  }

  // 6. Mocked 2xx with ask-aligned quote + publisher/date → found + billable
  {
    const html =
      "<html><body><p>" +
      "The purple widget specification was published on 2026-01-15 by Example Corp. ".repeat(
        5,
      ) +
      "</p></body></html>";
    const fetch200: FetchFn = async () => mockResponse(200, html);
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-ok",
        ask: "When was the purple widget specification published?",
      },
      { fetch: fetch200 },
    );
    const pass =
      r.verdict === "found" &&
      r.http_status === 200 &&
      r.meta?.mode === "live" &&
      r.meta?.billable === true &&
      typeof r.http_status === "number";
    results.push({
      id: "OG6-mocked-200-found",
      pass,
      detail: pass
        ? `verdict=found status=200 billable=${r.meta?.billable}`
        : `expected found/200/billable; got verdict=${r.verdict} status=${r.http_status} billable=${r.meta?.billable} gaps=${JSON.stringify(r.gaps)}`,
    });
  }

  // 7. Long excerpt WITHOUT page date → found but not billable (raised bar)
  {
    const html =
      "<html><body><p>" +
      "Purple widgets are useful tools for agents and hosts in many workflows. ".repeat(
        8,
      ) +
      "</p></body></html>";
    const fetch200: FetchFn = async () => mockResponse(200, html);
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-no-date",
        ask: "Are purple widgets useful for agents?",
      },
      { fetch: fetch200 },
    );
    const pass =
      r.verdict === "found" &&
      r.http_status === 200 &&
      r.meta?.billable === false &&
      r.gaps.some((g) => /page date|paid lookup bar/i.test(g));
    results.push({
      id: "OG7-long-excerpt-no-date-not-billable",
      pass,
      detail: pass
        ? `found but billable=false (no page date)`
        : `expected found/non-billable; got verdict=${r.verdict} billable=${r.meta?.billable} gaps=${JSON.stringify(r.gaps)}`,
    });
  }

  // 8. 404 then searchable replacement → moved
  {
    let fetchCalls = 0;
    const fetchSmart: FetchFn = async (input) => {
      fetchCalls += 1;
      const u = String(input);
      if (u.includes("missing-page")) return mockResponse(404, "gone");
      const html =
        "<html><body><article>" +
        "Replacement article: purple widget specification published on January 15, 2026. ".repeat(
          4,
        ) +
        "</article></body></html>";
      return mockResponse(200, html);
    };
    const searchHit: SearchFn = async () => [
      "https://example.com/replacement-purple-widget",
    ];
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/missing-page",
        ask: "When was the purple widget specification published?",
      },
      { fetch: fetchSmart, search: searchHit },
    );
    const pass =
      fetchCalls >= 2 &&
      r.verdict === "moved" &&
      r.http_status === 200 &&
      r.meta?.mode === "live" &&
      r.sources.some((s) => s.url.includes("replacement-purple-widget"));
    results.push({
      id: "OG8-404-search-replacement-moved",
      pass,
      detail: pass
        ? `verdict=moved after search+GET billable=${r.meta?.billable}`
        : `expected moved/200; got verdict=${r.verdict} status=${r.http_status} fetches=${fetchCalls} sources=${JSON.stringify(r.sources.map((s) => s.url))}`,
    });
  }

  // 9. Golden depth honesty: deep on unchanged golden → billable false
  {
    const deep = resolveBrief({
      query:
        "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
      depth: "deep",
    });
    const standard = resolveBrief({
      query:
        "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
      depth: "standard",
    });
    const gateDeep = applyChargeGate("research_brief", "deep", deep.meta);
    const gateStd = applyChargeGate(
      "research_brief",
      "standard",
      standard.meta,
    );
    const pass =
      deep.meta?.mode === "golden" &&
      deep.meta?.billable === false &&
      gateDeep.charge_usd === 0 &&
      deep.gaps.some((g) => /price≠work|price!=work|price≠work/i.test(g) || /price/.test(g)) &&
      standard.meta?.billable === true &&
      gateStd.billable === true &&
      gateStd.charge_usd === 0.6 &&
      briefPathMayBeBillable(
        "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
        "deep",
      ) === false &&
      briefPathMayBeBillable(
        "What is the Model Context Protocol, who created it, and who maintains it as of September 2026?",
        "standard",
      ) === true;
    results.push({
      id: "OG9-golden-depth-honesty",
      pass,
      detail: pass
        ? `deep billable=false; standard billable=true charge=0.6`
        : `deep meta=${JSON.stringify(deep.meta)} gaps=${JSON.stringify(deep.gaps)} std meta=${JSON.stringify(standard.meta)} gateDeep=${JSON.stringify(gateDeep)} gateStd=${JSON.stringify(gateStd)}`,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const results = await runCases();
  let failed = 0;
  for (const r of results) {
    process.stdout.write(
      JSON.stringify({
        type: "eval_off",
        id: r.id,
        pass: r.pass,
        detail: r.detail,
      }) + "\n",
    );
    if (!r.pass) failed += 1;
  }
  process.stdout.write(
    JSON.stringify({
      type: "eval_off_summary",
      total: results.length,
      passed: results.length - failed,
      failed,
      ship_bar: failed === 0,
    }) + "\n",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
