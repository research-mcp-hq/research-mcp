# Hosting plan — research-mcp

## Default: Fly.io

| Factor | Why Fly |
| --- | --- |
| Fit | First-class Dockerfile deploy; public HTTPS; health checks match `/health` |
| Cost | Hobby shared-cpu-1x ~$2–5/mo typical for a always-on tiny Node app; scale-to-zero possible but keep `min_machines_running = 1` for MCP latency |
| Ops | `fly deploy` + `fly secrets set`; rollbacks via release history; no separate LB |
| Alternatives considered | **Railway** — simpler UI, similar cost, slightly less control. **Render** free tier — cold starts hurt MCP. **Raw VPS** — more ops, no win yet. |

Public MCP URL shape: `https://research-mcp.fly.dev/mcp` (or custom domain later).

## Minimal deploy (Fly)

```bash
# once
fly auth login
fly apps create research-mcp   # or use existing name in deploy/fly.toml
fly secrets set API_KEYS="prod-key-...,..."
# optional: fly secrets set LIVE_RESEARCH=1

# from repo root
fly deploy -c deploy/fly.toml
curl -s https://research-mcp.fly.dev/health
```

Env:

| Var | Where |
| --- | --- |
| `API_KEYS` | `fly secrets` (required) |
| `HOST` / `PORT` | `fly.toml` (`0.0.0.0` / `3000`) |
| `LIVE_RESEARCH` | secret or omit (default off) |

## CI

`.github/workflows/ci.yml` — on push/PR to `main`: npm ci → build → eval → eval:off → local /health smoke → docker build + container smoke.

## Blockers needing Michael

1. Fly.io account (or approve Railway instead) — no paid account created by agents
2. Prod `API_KEYS` values (and optional custom domain / DNS)
3. GitHub Actions enabled on the private repo + connector/auth so agents can open PRs

## What ops can do without Michael

- Keep local Dockerfile/runbook honest; smoke `/health` + evals
- Draft CI + `deploy/fly.toml` in-repo
- Install Docker on the box and verify image build when privileges allow
- Wire Actions once GitHub access exists (no cloud spend)
