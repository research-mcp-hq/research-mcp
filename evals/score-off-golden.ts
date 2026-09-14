/**
 * Off-golden evals: no invented HTTP status / found without fetch.
 * Uses injectable fetch — CI does not need network.
 * Usage: npm run eval:off
 */

import { resolveBrief, resolveCompare, resolveLookup } from "../src/research/samples.js";
import type { FetchFn } from "../src/types.js";

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

  // 1. Off-golden random URL with mocked 404 → may emit 404 only because mock returned 404
  {
    let fetchCalls = 0;
    const fetch404: FetchFn = async () => {
      fetchCalls += 1;
      return mockResponse(404, "Not Found");
    };
    const r = await resolveLookup(
      {
        claim_or_url: "https://example.com/off-golden-random-404-path",
        ask: "Does this page exist?",
      },
      { fetch: fetch404 },
    );
    const pass =
      fetchCalls >= 1 &&
      r.verdict === "not_found" &&
      r.http_status === 404 &&
      r.meta?.mode === "live" &&
      r.meta?.billable === false;
    results.push({
      id: "OG1-mocked-404",
      pass,
      detail: pass
        ? `fetchCalls=${fetchCalls} status=404 (from mock)`
        : `expected live 404 after fetch; got verdict=${r.verdict} status=${r.http_status} fetches=${fetchCalls} meta=${JSON.stringify(r.meta)}`,
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
      { fetch: fetchFail },
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
      r.sources.length === 0;
    results.push({
      id: "OG3-non-url-unaudited",
      pass,
      detail: pass
        ? `verdict=unaudited confidence=unknown`
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
      { fetch: fetch403 },
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
      compare.gaps.some((g) => /not charged/i.test(g));
    results.push({
      id: "OG5-generic-brief-compare-sample",
      pass,
      detail: pass
        ? `brief+compare mode=sample billable=false`
        : `brief meta=${JSON.stringify(brief.meta)} body.mode=${bodyBrief.mode}; compare meta=${JSON.stringify(compare.meta)}`,
    });
  }

  // Bonus: mocked 2xx with content → found + live (billable only if bar-passing excerpt)
  {
    const html =
      "<html><body><p>" +
      "The purple widget specification was published on 2026-01-15 by Example Corp. ".repeat(5) +
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
      typeof r.http_status === "number";
    results.push({
      id: "OG6-mocked-200-found",
      pass,
      detail: pass
        ? `verdict=found status=200 billable=${r.meta?.billable}`
        : `expected found/200; got verdict=${r.verdict} status=${r.http_status}`,
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
