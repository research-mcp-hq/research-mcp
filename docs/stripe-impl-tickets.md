# Stripe impl tickets — research-mcp (Code & PRs)

**Audience:** Code & PRs agent  
**Source of truth:** [stripe-setup-brief.md](./stripe-setup-brief.md) (Dodger standing decisions 2026-09-14)  
**Path:** C — Checkout credit packs + our DB ledger  
**Mode:** Test keys only until Fly up + Michael go-live  

**Out of scope (do not ticket):** creating Stripe Dashboard products/prices (Michael); live mode; Customer Portal; Billing Credits; marketplace connectors; messaging anyone.

---

## T1 — SQLite ledger schema

**Goal:** Persist customers, balances, ledger, and customer API keys for alpha.

**Files (suggested):**
- `src/db/` or `src/billing/db.ts` — open SQLite via `DATABASE_URL` (e.g. `file:./data/ledger.sqlite`)
- `src/billing/schema.sql` (or migrate-on-boot)
- Ensure `data/` gitignored if file-backed

**Tables:**
- `customers(id TEXT PK, stripe_customer_id TEXT UNIQUE, email TEXT, created_at TEXT)`
- `credit_accounts(customer_id TEXT PK FK→customers, balance_cents INT NOT NULL DEFAULT 0, updated_at TEXT)`
- `ledger_entries(id TEXT PK, customer_id TEXT NOT NULL, delta_cents INT NOT NULL, reason TEXT NOT NULL, stripe_event_id TEXT UNIQUE, checkout_session_id TEXT, usage_request_id TEXT, sku TEXT, created_at TEXT)`
- `api_keys(key_hash TEXT PK, key_prefix TEXT NOT NULL, customer_id TEXT NOT NULL FK→customers, status TEXT NOT NULL DEFAULT 'active', created_at TEXT)`
- Index: `ledger_entries(checkout_session_id)`, `api_keys(customer_id)`, `api_keys(key_prefix)`

**Acceptance:**
- [ ] Boot creates/migrates tables idempotently
- [ ] Unique on `stripe_event_id` prevents double credit
- [ ] Unique (or app-enforced) grant per `checkout_session_id` for `reason=pack_purchase`
- [ ] `DATABASE_URL` required when billing enabled; clear error if missing

---

## T2 — Env + `.env.example`

**Goal:** Document and read Stripe + DB + break-glass keys.

**Files:**
- `.env.example`
- `src/billing/config.ts` (or extend existing env parse)

**Add / document:**
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_CREDITS_10=
STRIPE_PRICE_CREDITS_25=
STRIPE_PRICE_CREDITS_50=
STRIPE_PUBLISHABLE_KEY=          # optional if server-only Checkout create
BILLING_SUCCESS_URL=http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}
BILLING_CANCEL_URL=http://localhost:3000/billing/cancel
DATABASE_URL=file:./data/ledger.sqlite
API_KEYS=                        # break-glass; keep alongside customer keys
```

**Acceptance:**
- [ ] `.env.example` lists all vars with short comments
- [ ] App reads `sk_test_` / `whsec_` without requiring live keys
- [ ] Missing required Stripe vars fail loudly on billing routes only (MCP can still run on break-glass `API_KEYS` alone until billing wired)

---

## T3 — Webhook route `/webhooks/stripe`

**Goal:** Verify + fulfill Checkout packs idempotently.

**Files:**
- `src/billing/webhook.ts` — handlers
- `src/index.ts` — register `POST /webhooks/stripe` **before** JSON body parser (raw body for signature)
- Depends: T1, T2, Stripe SDK

**Behavior:**
1. Verify signature with `STRIPE_WEBHOOK_SECRET` + raw body ([fulfillment](https://docs.stripe.com/checkout/fulfillment)).
2. `checkout.session.completed` / `async_payment_succeeded`: if `payment_status === paid` → fulfill (T4 + T5).
3. `async_payment_failed`: log; no credit.
4. `expired`: optional cleanup.
5. Idempotent on `event.id` (`stripe_event_id`) and/or `session.id`.
6. Respond 200 quickly after durable write; 400 on bad signature.

**Acceptance:**
- [ ] Bad signature → 400, no DB write
- [ ] Same event twice → single credit grant
- [ ] Unpaid / failed → no credit
- [ ] Does not also fulfill on `payment_intent.succeeded`

---

## T4 — Checkout session create

**Goal:** Minimal start-checkout for packs (admin/billing start OK for alpha).

**Files:**
- `src/billing/checkout.ts`
- `src/index.ts` — e.g. `POST /billing/checkout` `{ pack: "starter"|"standard"|"pro" }` or `price` key
- Auth: break-glass `API_KEYS` or simple shared billing secret for alpha (document choice)

**Behavior:**
- Map pack → `STRIPE_PRICE_CREDITS_*`
- `stripe.checkout.sessions.create`: `mode=payment`, line_items qty 1, `success_url` / `cancel_url` from env, metadata `pack` + `credits_usd_cents`, `customer_creation=always` (or attach existing)
- Return `{ url }` for redirect

**Acceptance:**
- [ ] Creates Session in test mode with correct price + metadata
- [ ] URLs come from env (placeholders OK until Fly)
- [ ] Unknown pack → 400

---

## T5 — Auto API key on paid webhook

**Goal:** Issue customer key when pack paid; one-time reveal on success page.

**Files:**
- `src/billing/keys.ts` — generate, hash (sha256 or scrypt), prefix
- Webhook fulfill path (T3)
- `GET /billing/success` (T8) — reveal once via `session_id`

**Behavior:**
- On fulfill: upsert customer from Stripe customer/email; credit ledger; if no active key for customer → generate plaintext once, store hash+prefix, stash plaintext in short-lived success store keyed by `checkout_session_id` (memory/DB with TTL) for success page
- Never log plaintext key
- Env `API_KEYS` unchanged as break-glass

**Acceptance:**
- [ ] Paid webhook creates hashed key row
- [ ] Success page shows plaintext at most once
- [ ] Replay of success URL does not re-show (or shows “already revealed”)
- [ ] Second purchase for same customer does not spam keys unless none active (document: reuse existing)

---

## T6 — Ledger debit behind charge gate

**Goal:** Replace/augment `StdoutUsageLogger` so billable calls debit; insufficient rejects.

**Files:**
- `src/usage.ts` — keep `applyChargeGate`; extend logger interface
- `src/billing/ledger.ts` — `debitIfBillable(...)`
- `src/server.ts` — surface MCP error on insufficient (may need pre-check or post-gate throw)
- `src/index.ts` — wire `LedgerUsageLogger` (still stdout log optional)

**Behavior:**
- Resolve auth → `customer_id` (customer key) or skip ledger for break-glass `API_KEYS` (ops: no debit **or** dedicated ops account — pick one; recommend: break-glass skips debit, logs `break_glass=true`)
- `!billable` / `charge_usd===0` → log only, no debit (sample / quality-fail / snippet)
- Billable → atomic check+decrement; debit cents: lite 25, standard 60, deep 150
- Insufficient:
  - MCP tool error: clear `insufficient_credits` message
  - If HTTP billing/tool surface exists: **402** + `{ error: "insufficient_credits", message }`
- Never go negative

**Acceptance:**
- [ ] Quality-fail / sample → no ledger debit
- [ ] Billable with balance → debit + ledger row with `usage_request_id` + sku
- [ ] Insufficient → MCP error; no negative balance
- [ ] Break-glass `API_KEYS` still authenticate

---

## T7 — Auth: customer keys OR break-glass `API_KEYS`

**Goal:** Dual auth path.

**Files:**
- `src/auth.ts` — resolve presented key against env set **or** `api_keys.key_hash` (active)
- Populate `AuthContext` with `customerId?`, `keyId`, `breakGlass: boolean`

**Acceptance:**
- [ ] Env key works without DB row
- [ ] Customer key works via hash lookup
- [ ] Invalid → 401
- [ ] Revoked/disabled customer key → 401

---

## T8 — Success / cancel pages (placeholders)

**Goal:** Minimal HTML/JSON pages until Fly URL.

**Files:**
- `src/index.ts` — `GET /billing/success`, `GET /billing/cancel`
- Success: read `session_id`, show one-time key + credited amount if fulfill already ran (poll/wait briefly if webhook race)

**Acceptance:**
- [ ] Cancel explains retry via checkout
- [ ] Success reveals key once when available
- [ ] Works with localhost URLs; env-swappable for Fly later

---

## T9 — Tests

**Goal:** Lock critical billing invariants.

**Files:** `evals/` or `src/billing/*.test.ts` (match repo test runner)

**Cases:**
1. Webhook idempotency — duplicate `event.id` / session → single grant
2. Debit gate — billable call decrements exact cents
3. Insufficient balance — MCP error (+ 402 if HTTP helper tested); balance unchanged / non-negative
4. Quality-fail / non-billable — no charge / no debit
5. Signature reject — tampered payload

**Acceptance:**
- [ ] All four core cases green in CI
- [ ] No live Stripe calls required (stripe-mock or signed fixture + DB)

---

## Suggested PR order

1. T1 + T2 (schema + env)  
2. T7 (auth dual-path) — can land with stub DB  
3. T3 + T5 (webhook fulfill + key issue)  
4. T4 + T8 (checkout start + pages)  
5. T6 (ledger debit + errors)  
6. T9 (tests hardening)

---

## Explicit non-goals (these tickets)

- Stripe Dashboard Product/Price creation  
- Live mode / `sk_live_`  
- Customer Portal  
- Billing Credits / Meters / Subscriptions  
- Marketplace / Connect  
- Auto refund webhook → ledger (manual process in brief §3)  
- Messaging Slack/email to humans

---

## T10 — Auth’d credits read (visible meter)

**Goal:** Smallest public ledger read so callers can see remaining credits + locked SKU table. No price changes.

**Files (suggested):**
- `src/billing/credits.ts` — handler
- `src/index.ts` — `GET /billing/credits` behind customer-key auth

**Behavior:**
- Auth: customer API key → resolve `customer_id` → `getBalanceCents`
- JSON: `balance_cents`, pack table ($10/$25/$50 → cents), meter table (lite/standard/deep), `fail_usd: 0`
- Optional: last usage/gate fields if cheap to store
- Break-glass keys: `403` or `{ break_glass: true, balance_cents: null }`

**Acceptance:**
- [ ] Customer key returns current balance
- [ ] No SKU/pack amount changes
- [ ] Documented in `docs/visible-meter.md` + Growth README pointer

**Out of scope:** Customer Portal, Billing Credits, marketplace metering, Michael ping

