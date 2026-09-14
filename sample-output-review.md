# Sample-output review (2026-09-12)

Against quality-bars.md + niche-goldens.md. Code & PRs eval 10/10 @ 6/6 is **fixture replay**, not live research.

## Verdict

| Layer | Result |
|---|---|
| Frozen goldens G1–G7, N1–N3 | **PASS** |
| `npm run eval` as ship evidence | **PASS as replay test only** |
| Off-golden sample path | **FAIL** (two hard bar breaks) |
| Live path (`LIVE_RESEARCH=1`, depth=quick) | **Conditional** — honest low-confidence leads, not a brief |

Do **not** charge `standard`/`deep` off-golden calls until live fetch exists or those calls stay no-charge.

---

## Goldens (content)

All ten canned answers match the bars: no invented prices/take rates/installs, legal confidence, density met, must-include/must-not, honest gaps.

- **G1** high, 5 primaries, authors + 2024-11-25 + AAIF 2025-12-09 + spec 2026-07-28. Does not call MCP an A2A protocol.
- **G2** unknown; no `$`; gaps name smithery.ai/pricing. Secondaries labeled.
- **G3** conditional rec (MCP now, A2A later); 150+ attributed, not audited. Confidence `high` is OK because adoption is isolated in a note (bar allowed high-on-roles / medium-on-counts).
- **G4** take_rate cells `unknown`; overall `low`.
- **G5** found / 200 / Nov 25, 2024 / both authors.
- **G6** not_found; points at 2026-07-28; does not invent a 2019 spec. *Note:* 404 is frozen from authoring, not a runtime GET.
- **G7** found as first-party claim; `medium`; roster gap.
- **N1** annotations = hints; untrusted; no CVE.
- **N2** MUST NOT / forbidden; confused deputy named.
- **N3** caller not substitute; 403 launch-page gap; does not state Sep 10 as high.

Eval tautology: `resolve*` returns the golden object; `score-goldens.ts` then string-matches that same object. 10/10 proves the router hits fixtures, not that research works.

---

## Failures (must fix before billing non-golden traffic)

1. **`genericLookup` invents HTTP status.** A non-golden URL is returned as `verdict: not_found`, `http_status: 404` with no fetch. That is fabrication. Bar: never invent status; 403 ≠ does-not-exist; lookup needs a live GET.
2. **`genericLookup` on a non-URL claim returns `verdict: found`.** Should be `unknown` confidence and a non-found/unaudited verdict (or refuse), not `found`.
3. **`genericBrief` / `genericCompare` cite the frozen MCP/A2A URL set regardless of query.** Honest `mode: sample` + gaps, but they still *cite* pages not fetched for that query. Fine as a labeled demo; **fail if charged** as research.

## Live path

DuckDuckGo HTML snippets only; pages not fetched; confidence forced `low`. Acceptable for `quick` **leads**, not for a paid brief. `standard`/`deep` never go live.

---

## Notes for Code & PRs (via Dodger — not pinged)

- Keep goldens as-is.
- Add eval cases for **off-golden** lookup: must not emit 404/`found` without a fetch.
- `source_lookup` needs a real GET (and 403 → `blocked`, not `not_found`).
- Charge only golden-matched or live-fetched-and-bar-passing calls (already: fail bar = no charge).
