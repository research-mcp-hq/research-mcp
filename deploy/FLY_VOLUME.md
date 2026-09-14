# Fly volume plan — SQLite ledger (alpha)

**App:** `research-mcp-mhh`  
**Region:** `iad` (match machine)  
**Why:** `DATABASE_URL=file:./data/ledger.sqlite` writes under `/app/data`. Without a volume, machine replace wipes balances + issued API keys.

## Constraints

- **One machine only** while on file SQLite (no multi-node share). Keep `min_machines_running = 1` and do not scale `count` > 1.
- Volume is **not** a backup. Snapshot/export before anything that looks like real money.
- TEST smoke can run briefly without a volume; **create volume before any non-throwaway credits**.

## Create + attach (run when Dodger says go)

```bash
export PATH="$HOME/.fly/bin:$PATH"
# 1 GiB is plenty for alpha ledger
fly volumes create ledger_data --region iad --size 1 -a research-mcp-mhh

# Confirm
fly volumes list -a research-mcp-mhh
```

Add to `deploy/fly.toml` (then `fly deploy`):

```toml
[mounts]
  source = "ledger_data"
  destination = "/app/data"
```

Working directory in the image is `/app`, so:

```bash
DATABASE_URL="file:./data/ledger.sqlite"
# resolves to /app/data/ledger.sqlite on the volume
```

Equivalent absolute form (also fine):

```bash
DATABASE_URL="file:/app/data/ledger.sqlite"
```

## Order of operations (Stripe TEST)

1. Create volume + add `[mounts]` + deploy (empty `data/` ok).
2. `fly secrets set` Stripe + billing URLs + `DATABASE_URL` (**do not** drop existing `API_KEYS`).
3. Secrets restart the machine; confirm health + `POST /webhooks/stripe` returns misconfig/signature errors only (not 404).
4. Stripe Dashboard webhook → Send test event / real TEST checkout smoke.

## Rollback / wipe

```bash
# detach by removing [mounts] and redeploying, or destroy volume (DESTROYS DATA)
fly volumes list -a research-mcp-mhh
# fly volumes destroy <vol_id> -a research-mcp-mhh
```

## Later (before paid prod)

- Move ledger to Postgres (Fly Managed Postgres / Neon) or LiteFS if multi-region.
