# Cloudflare Pages + DNS — researchmcp.dev

**Goal:** Marketing site on `https://researchmcp.dev` via Cloudflare Pages.  
**Out of scope this pass:** Custom hostname for MCP API — stays `https://research-mcp-mhh.fly.dev/mcp`.

Domain is on **Michael’s Cloudflare account**. Agents cannot complete dashboard steps without his login.

---

## Target architecture

| Surface | Hostname | Backend |
| --- | --- | --- |
| Marketing / docs home | `researchmcp.dev` (+ optional `www`) | Cloudflare Pages |
| MCP API | `research-mcp-mhh.fly.dev` | Fly (unchanged) |
| Health | `research-mcp-mhh.fly.dev/health` | Fly |

Suggested Pages project name: `researchmcp` → produces `researchmcp.pages.dev` until custom domain is attached.

---

## DNS records (zone: researchmcp.dev on Cloudflare)

After Pages custom-domain setup, Cloudflare usually **auto-creates** these if the zone is on the same account. Expected end state:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| `CNAME` | `@` (apex) | `<project>.pages.dev` e.g. `researchmcp.pages.dev` | Proxied (orange cloud) |
| `CNAME` | `www` | `<project>.pages.dev` **or** `researchmcp.dev` | Proxied |

Notes:
- Apex on Cloudflare uses a **CNAME flattening** record to `*.pages.dev` (not an A record you invent).
- Do **not** manually invent IPs. Prefer: Pages → Custom domains → Set up domain → let CF write DNS.
- Optional later: Redirect `www` → apex (Rules → Redirect Rules).
- Leave **no** DNS for `/mcp` on this domain yet.

---

## What Michael clicks (Cloudflare dashboard)

### A. Confirm zone
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com) (account that owns `researchmcp.dev`).
2. Open the **researchmcp.dev** zone.
3. Confirm nameservers are Cloudflare’s (Registrar → DNS → NS). Domain already bought on CF → should be fine.

### B. Create Pages project (once GitHub repo exists)
1. Sidebar → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize **GitHub** if prompted; select org **`research-mcp-hq`**.
3. Pick the landing repo (expected: `research-mcp-hq/www` or `research-mcp-hq/research-mcp` `/site` — Code will name it).
4. Build settings (static HTML stub typical):
   - **Framework preset:** None / static
   - **Build command:** empty *or* whatever Code documents (e.g. `npm run build`)
   - **Build output directory:** `/` or `dist` / `public` (per Code README)
   - **Root directory:** repo root or `/site` if monorepo
5. **Save and Deploy** → wait for first `*.pages.dev` URL green.

### C. Attach custom domain
1. Pages project → **Custom domains** → **Set up a domain**.
2. Enter `researchmcp.dev` → Continue.
3. If asked, also add `www.researchmcp.dev`.
4. Accept Cloudflare-managed DNS records (CNAME to `*.pages.dev`).
5. Wait until status = **Active** (TLS automatic).

### D. Sanity checks (Michael or Deploy)
```bash
curl -sI https://researchmcp.dev | head -5
curl -sI https://www.researchmcp.dev | head -5
# API still Fly-only:
curl -sS https://research-mcp-mhh.fly.dev/health
```

### E. Do **not** do this pass
- Do not point `researchmcp.dev` A/AAAA at Fly.
- Do not add `mcp.researchmcp.dev` yet.
- Do not change Stripe/Smithery URLs until Growth says cut over `websiteUrl`.

---

## When Code’s site hits GitHub

Deploy/Ops will:
1. Confirm repo URL + build output dir from Code.
2. Either guide Michael through **Connect to Git** (above) **or**, if he hands CF API token later, automate project create.
3. After first `*.pages.dev` success, walk him through **Custom domains** for apex + www.
4. Report Active TLS + curl results to Dodger/Growth.

**Until repo exists:** Michael can still create an empty Pages project with “Upload assets” for a placeholder — optional; Git connect is preferred.

---

## Sticky reminder

| Keep on Fly | Value |
| --- | --- |
| MCP | `https://research-mcp-mhh.fly.dev/mcp` |
| Health | `https://research-mcp-mhh.fly.dev/health` |
| Secrets | `LIVE_RESEARCH=1`, `DEMAND_LOG=1`, `STRIPE_ALLOW_LIVE=1`, volume/`DATABASE_URL` |
