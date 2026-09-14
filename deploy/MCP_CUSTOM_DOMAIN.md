# mcp.researchmcp.dev → Fly

**Goal:** Brand MCP endpoint `https://mcp.researchmcp.dev/mcp` (and `/health`) so the marketing site can drop the `*.fly.dev` hostname.  
**App:** `research-mcp-mhh`  
**Prefer:** subdomain → Fly (not `researchmcp.dev/mcp` Pages proxy — streamable HTTP MCP is a poor fit for static Pages).

## Fly side (Deploy — already started)

```bash
fly certs add mcp.researchmcp.dev -a research-mcp-mhh
fly secrets set ALLOWED_HOSTS="mcp.researchmcp.dev,researchmcp.dev,www.researchmcp.dev" -a research-mcp-mhh
# KEEP: LIVE_RESEARCH=1 DEMAND_LOG=1 STRIPE_ALLOW_LIVE=1 API_KEYS DATABASE_URL …
```

**Yes — Fly custom cert is required** (Let’s Encrypt via `fly certs`). Cloudflare alone is not enough if traffic goes to Fly origin.

Current cert setup options from Fly:

| Option | Records |
| --- | --- |
| **Recommended** | `A mcp` → `66.241.125.211` ; `AAAA mcp` → `2a09:8280:1::18d:a467:0` |
| Alternate | `CNAME mcp` → `o90lnke.research-mcp-mhh.fly.dev` |
| If CF orange-cloud | Also `TXT _fly-ownership.mcp` → `app-o90lnke` + SSL mode Full/Strict |

## Michael — Cloudflare DNS (zone researchmcp.dev)

1. Open [dash.cloudflare.com](https://dash.cloudflare.com) → zone **researchmcp.dev** → **DNS** → **Records**.
2. **Add** (DNS only / grey cloud for easiest Fly LE — turn proxy off):

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| `A` | `mcp` | `66.241.125.211` | **DNS only** (grey) |
| `AAAA` | `mcp` | `2a09:8280:1::18d:a467:0` | **DNS only** (grey) |

3. Save. Wait 1–5 minutes.
4. Tell Deploy — we’ll run `fly certs check mcp.researchmcp.dev` until Issued.
5. Verify:
```bash
curl --doh-url https://1.1.1.1/dns-query -sS https://mcp.researchmcp.dev/health
# expect {"status":"ok",...}
curl --doh-url https://1.1.1.1/dns-query -sS -o /dev/null -w "%{http_code}\n" \
  -X POST https://mcp.researchmcp.dev/mcp -H 'Authorization: Bearer bad'
# expect 401
```

### If you prefer orange-cloud (proxied)

1. Same A/AAAA **or** CNAME `mcp` → `o90lnke.research-mcp-mhh.fly.dev`, proxy **on**.
2. Add TXT: name `_fly-ownership.mcp` content `app-o90lnke`.
3. SSL/TLS → Overview → mode **Full (Strict)**.
4. Still need Fly cert Issued (ownership TXT helps).

## Homepage / Growth after green

Install snippet / site copy:

```text
https://mcp.researchmcp.dev/mcp
```

Keep `https://research-mcp-mhh.fly.dev/mcp` as fallback; do not remove Fly hostname until Growth cutover is done.

## Not this pass

- Apex `researchmcp.dev` → Fly (site stays Pages).
- Path proxy `researchmcp.dev/mcp` via Workers (possible later; more moving parts).
