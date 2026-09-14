# Visible meter — what exists vs gap (Billing → Growth)

**Date:** 2026-09-14  
**Locked SKUs (do not change):** packs **$10 / $25 / $50**; call meters **lite $0.25 / standard $0.60 / deep $1.50**; quality/gate fail = **$0**.  
**Host:** `https://research-mcp-mhh.fly.dev`

Outsider ask: prepaid + fail=$0 needs a **visible** meter (pack SKU, remaining credits, last gate decision) + public price on the product page.

---

## Locked public price line (for README / listings)

- **Top-up packs:** $10 (starter / 1000¢) · $25 (standard / 2500¢) · $50 (pro / 5000¢)
- **Per successful call:** lite **$0.25** · standard **$0.60** · deep **$1.50**
- **Not charged:** sample/demo, quality-bar fail, depth-mismatched golden, snippet-only / COGS abort (`billable=false`, `charge_usd=0`)

---

## What exists today (callable / inspectable)

| Surface | Auth | What a caller sees |
| --- | --- | --- |
| `POST /billing/checkout` `{ "pack": "starter\|standard\|pro" }` | Break-glass `API_KEYS` (Bearer / X-API-Key) | Stripe Checkout URL for that pack |
| `GET /billing/success?session_id=cs_…` | Public (one-time) | HTML: pack credits cents + **one-time** API key reveal |
| `GET /billing/cancel` | Public | HTML retry hint |
| `POST /webhooks/stripe` | Stripe signature | Fulfills pack → ledger credit (not for customers) |
| `POST /mcp` tools | Customer key or break-glass | On insufficient balance: MCP error `insufficient_credits` (message includes balance vs need). HTTP helper can return **402** + `{ error, balance_cents, required_cents }` |
| Stdout / Fly logs `type=usage` | Ops only | Per call: `billable`, `charge_usd`, `mode`, `tool`, `customerId?` — **not** a customer API |
| `GET /.well-known/mcp/server-card.json` | Public | Tool list for registries — **no prices/balance yet** |
| `GET /health` | Public | `{ status, version }` only |

**Internal (not HTTP):** `getBalanceCents(customerId)` in `src/billing/ledger.ts`; ledger tables `credit_accounts`, `ledger_entries`.

---

## Gap (visible meter)

**Status (P0):** Implemented as `GET /billing/credits` (`src/billing/credits.ts`).

~~**Missing:** auth’d customer read of remaining credits + last gate decision.~~

No `GET /billing/balance` (or equivalent). After success-page reveal, a bot/customer **cannot** inspect remaining balance or last `billable`/`charge_usd` without ops log access.

### Smallest ticket (no price changes)

**T10 — `GET /billing/credits` (auth’d)**  
- Auth: customer API key (same dual path as `/mcp`; reject or flag break-glass)  
- Response JSON e.g. `{ balance_cents, balance_usd, packs: { starter: 1000, standard: 2500, pro: 5000 }, meters_usd: { lite: 0.25, standard: 0.60, deep: 1.50 }, fail_usd: 0 }`  
- Optional v1.1: `last_usage: { requestId, tool, billable, charge_usd, mode, timestamp }` from last ledger debit / usage row for that customer  
- Do **not** change SKUs or pack amounts

Growth can put the locked price line on the product page / README **now**; T10 unblocks “remaining credits” for bots.

---

## Repo anchors

- Routes: `src/index.ts`  
- Ledger: `src/billing/ledger.ts`  
- Usage / gate: `src/usage.ts`  
- Pricing lock: `pricing-addendum.md`, `docs/stripe-setup-brief.md`
