# Fly deploy runbook — research-mcp

**Host locked:** Fly.io. Do **not** create a Fly account or run billing-creating auth from an agent session. Michael creates the account; then we do device login + secrets + deploy with him.

Placeholders (replace before/during the live session):

| Placeholder | Example | Notes |
| --- | --- | --- |
| `<APP_NAME>` | `research-mcp` | Must be globally unique on Fly; set in `deploy/fly.toml` `app = "..."` |
| `<ORG>` | `personal` | Optional; `fly apps create` may prompt |
| `<PRIMARY_REGION>` | `iad` | Already in `fly.toml`; change if needed |
| `<API_KEYS>` | `key1,key2` | Comma-separated; never commit; set only via `fly secrets` |
| `<LIVE_RESEARCH>` | `0` or `1` | Optional secret; default off |

Public URLs after deploy:

- Health: `https://<APP_NAME>.fly.dev/health`
- MCP: `https://<APP_NAME>.fly.dev/mcp`

---

## 0. Prerequisites (Michael)

1. Fly.io account exists (https://fly.io/app/sign-up) — **human only**
2. Billing/payment method attached if Fly requires it for Machines — **human only**
3. Prod `<API_KEYS>` chosen (rotate away from `dev-key-*`)
4. Optional: custom domain ready (DNS later)

Agents may install the Fly CLI on the box but must **stop before** `fly auth login` / `fly apps create` / anything that binds a paid org unless Michael is present.

---

## 1. CLI on the box (safe, no account)

```bash
# install flyctl if missing (no auth yet)
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
fly version
```

---

## 2. Auth (Michael present — device flow)

```bash
fly auth login
# complete browser/device prompt as Michael
fly auth whoami
```

---

## 3. App + config

```bash
cd /workspace/research-mcp

# Edit deploy/fly.toml: set app = "<APP_NAME>" and primary_region if needed

fly apps create <APP_NAME>
# or: fly launch --no-deploy -c deploy/fly.toml
# Decline extra Postgres/Redis; this app needs neither for v0
```

Confirm `deploy/fly.toml` matches:

- `app = "<APP_NAME>"`
- `[http_service] internal_port = 3000`, `force_https = true`
- health check `GET /health`
- `min_machines_running = 1` (avoid cold starts for MCP)

---

## 4. Secrets

```bash
fly secrets set API_KEYS="<API_KEYS>" -a <APP_NAME>
# optional:
# fly secrets set LIVE_RESEARCH="<LIVE_RESEARCH>" -a <APP_NAME>
fly secrets list -a <APP_NAME>
```

Never put `API_KEYS` in `fly.toml` or git.

---

## 5. Deploy (remote builder — no local Docker required)

```bash
cd /workspace/research-mcp
fly deploy -c deploy/fly.toml -a <APP_NAME>
```

Fly builds from the repo `Dockerfile` on their builders.

---

## 6. Verify

```bash
curl -sS https://<APP_NAME>.fly.dev/health
# expect: {"status":"ok","version":"0.1.0"}

curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://<APP_NAME>.fly.dev/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer bad' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# expect: 401

curl -sS -X POST https://<APP_NAME>.fly.dev/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer <one-of-API_KEYS>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# expect: tools include research_brief, compare_options, source_lookup
```

---

## 7. Rollback

```bash
fly releases -a <APP_NAME>
fly deploy --image <previous-image> -a <APP_NAME>
# or redeploy a known-good git SHA after checkout
```

---

## Still blocked / not done by agents alone

- Fly account + billing (Michael)
- First `fly auth login` (Michael device)
- Choosing `<APP_NAME>` + prod `<API_KEYS>`
- Pushing `.github/workflows/ci.yml` (PAT needs `workflow` scope)
