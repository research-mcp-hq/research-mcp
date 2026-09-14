/**
 * R1 demand instrumentation unit tests.
 * Run: npm run test:demand
 */
import assert from "node:assert/strict";
import {
  assertNoQueryKeys,
  buildDemandEvent,
  classifyTopicBucket,
  customerKeyHash,
  detectHost,
  FORBIDDEN_DEMAND_KEYS,
  mapOutcome,
  meterForTool,
} from "../src/demand.js";
import {
  goldenBriefSparse,
  goldenCompareMissing,
  goldenNicheBriefAnnotations,
  goldenNicheBriefAgentsApi,
  goldenBriefHappy,
  goldenNicheLookupTokenPassthrough,
} from "../src/research/goldens.js";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`FAIL- ${name}\n`);
    process.stdout.write(`      ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  }
}

await test("classifier: mcp_security wins (annotations / readonlyhint)", () => {
  assert.equal(
    classifyTopicBucket(goldenNicheBriefAnnotations().query),
    "mcp_security",
  );
  assert.equal(
    classifyTopicBucket("Does readOnlyHint skip confirmation?"),
    "mcp_security",
  );
  assert.equal(
    classifyTopicBucket(
      `${goldenNicheLookupTokenPassthrough().claim_or_url} ${goldenNicheLookupTokenPassthrough().ask}`,
    ),
    "mcp_security",
  );
  assert.equal(
    classifyTopicBucket("confused deputy and tool poisoning in MCP"),
    "mcp_security",
  );
});

await test("classifier: G2/G4-like pricing → other (honesty fixtures)", () => {
  assert.equal(classifyTopicBucket(goldenBriefSparse().query), "other");
  const g4 = goldenCompareMissing();
  assert.equal(
    classifyTopicBucket([g4.question, ...g4.options, ...g4.criteria].join(" ")),
    "other",
  );
  assert.equal(
    classifyTopicBucket(
      "What is Hobby plan list price in USD for hosted MCP servers?",
    ),
    "other",
  );
  assert.equal(
    classifyTopicBucket("Compare marketplace take rate for MCP directories"),
    "other",
  );
});

await test("classifier: mcp vs agent_infra vs other", () => {
  assert.equal(classifyTopicBucket(goldenBriefHappy().query), "mcp");
  // Agents API golden mentions MCP servers → mcp wins over agent_infra (spec priority)
  assert.equal(
    classifyTopicBucket(goldenNicheBriefAgentsApi().query),
    "mcp",
  );
  // agent_infra when host/runtime tokens hit without mcp_security / mcp / pricing
  assert.equal(
    classifyTopicBucket("How does OpenAI Agents API tool calling work?"),
    "agent_infra",
  );
  assert.equal(
    classifyTopicBucket("claude connector setup for agents"),
    "agent_infra",
  );
  assert.equal(
    classifyTopicBucket("generic CVE hunt for openssl buffer overflow"),
    "other",
  );
  assert.equal(classifyTopicBucket(""), "other");
  assert.equal(classifyTopicBucket(undefined), "other");
});

await test("demand event has no query-like keys", () => {
  const event = buildDemandEvent({
    requestId: "req-1",
    tool: "research_brief",
    depth: "standard",
    classifyText: goldenBriefHappy().query,
    meta: { mode: "golden", billable: true },
    billable: true,
    charge_usd: 0.6,
    keyId: "rmcp_abcd1234",
    breakGlass: false,
    sources: goldenBriefHappy().sources,
    gaps: [],
  });
  assert.equal(event.type, "demand");
  assert.equal(event.topic_bucket, "mcp");
  assert.equal(event.request_id, "req-1");
  assert.equal(event.depth, "standard");
  assert.equal(event.meter, "standard");
  assert.equal(event.path, "golden");
  assert.equal(event.billable, true);
  assert.equal(event.outcome, "bar_pass");
  assert.equal(event.break_glass, false);
  assert.ok(event.customer_key_hash);
  assert.ok((event.primary_count ?? 0) > 0);

  const asRec = event as unknown as Record<string, unknown>;
  assertNoQueryKeys(asRec);
  for (const k of FORBIDDEN_DEMAND_KEYS) {
    assert.equal(asRec[k], undefined, `must not have ${k}`);
  }
  // Also ensure JSON serialization never sneaks them in
  const json = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  assertNoQueryKeys(json);
});

await test("demand event: break_glass nulls customer_key_hash; depth null for lookup", () => {
  const event = buildDemandEvent({
    requestId: "req-2",
    tool: "source_lookup",
    classifyText: "token passthrough confused deputy",
    meta: { mode: "live", billable: false },
    billable: false,
    charge_usd: 0.25,
    keyId: "ops-key",
    breakGlass: true,
    verdict: "blocked",
    http_status: 403,
  });
  assert.equal(event.customer_key_hash, null);
  assert.equal(event.break_glass, true);
  assert.equal(event.depth, null);
  assert.equal(event.meter, "lite");
  assert.equal(event.outcome, "blocked");
  assert.equal(event.topic_bucket, "mcp_security");
  assert.equal(event.charge_usd, 0);
});

await test("host detection map + unknown default", () => {
  assert.equal(detectHost({ "user-agent": "Cursor/1.0" }), "cursor");
  assert.equal(detectHost({ "user-agent": "claude-desktop/0.1" }), "claude");
  assert.equal(
    detectHost({ "x-mcp-client-name": "openai-agents" }),
    "openai_agents",
  );
  assert.equal(detectHost({ "user-agent": "Smithery-CLI/2" }), "smithery");
  assert.equal(detectHost({ "user-agent": "Mozilla/5.0" }), "unknown");
  assert.equal(detectHost(undefined), "unknown");
  // Must not infer from query-like text passed as header accidentally still ok
  assert.equal(detectHost({ "user-agent": "" }), "unknown");
});

await test("meter + outcome helpers", () => {
  assert.equal(meterForTool("research_brief", "quick"), "lite");
  assert.equal(meterForTool("research_brief", "standard"), "standard");
  assert.equal(meterForTool("research_brief", "deep"), "deep");
  assert.equal(meterForTool("source_lookup", undefined), "lite");
  assert.equal(meterForTool("compare_options", undefined), "standard");

  assert.equal(mapOutcome({ billable: true }), "bar_pass");
  assert.equal(
    mapOutcome({ billable: false, body: { cogs_abort: true } }),
    "cogs_abort",
  );
  assert.equal(
    mapOutcome({ billable: false, body: { cancelled: true } }),
    "cancelled",
  );
  assert.equal(
    mapOutcome({ billable: false, verdict: "unaudited" }),
    "unaudited",
  );
  assert.equal(
    mapOutcome({ billable: false, http_status: 403 }),
    "blocked",
  );
  assert.equal(
    mapOutcome({ billable: false, mode: "sample" }),
    "bar_fail",
  );
});

await test("customerKeyHash truncates; null for break-glass", () => {
  assert.equal(customerKeyHash("rmcp_abcd", true), null);
  const h = customerKeyHash("rmcp_abcd", false);
  assert.ok(h);
  assert.equal(h!.length, 16);
  assert.equal(customerKeyHash(undefined, false), null);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
