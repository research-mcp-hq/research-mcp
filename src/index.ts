import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import express from "express";
import { hostHeaderValidation } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Request, Response, NextFunction } from "express";
import { requireApiKey, requireBreakGlassApiKey } from "./auth.js";
import { isBillingConfigured, isCreditPack, requireStripeBillingEnv } from "./billing/config.js";
import { createCheckoutSession } from "./billing/checkout.js";
import { initLedgerDb, getLedgerDb } from "./billing/db.js";
import { renderCancelPage, renderSuccessPage } from "./billing/pages.js";
import { handleStripeWebhook } from "./billing/webhook.js";
import { createResearchMcpServer } from "./server.js";
import { LedgerUsageLogger, StdoutUsageLogger } from "./usage.js";
import { VERSION } from "./version.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? (process.env.FLY_APP_NAME ? "::" : "0.0.0.0");

const usage =
  process.env.DATABASE_URL?.trim()
    ? new LedgerUsageLogger()
    : new StdoutUsageLogger();

interface RequestStore {
  requestId: string;
  keyId: string;
  customerId?: string;
  breakGlass?: boolean;
}

const requestStore = new AsyncLocalStorage<RequestStore>();

const mcpHandler = createMcpHandler(() => {
  const store = requestStore.getStore();
  const requestId = store?.requestId ?? randomUUID();
  const keyId = store?.keyId ?? "unknown";
  return createResearchMcpServer({
    requestId,
    keyId,
    usage,
    customerId: store?.customerId,
    breakGlass: store?.breakGlass,
  });
});

const node = toNodeHandler(mcpHandler);

async function main(): Promise<void> {
  // Init ledger when DATABASE_URL set (billing or customer keys).
  if (process.env.DATABASE_URL?.trim()) {
    await initLedgerDb();
  } else if (isBillingConfigured()) {
    process.stderr.write(
      JSON.stringify({
        type: "config_warning",
        message:
          "STRIPE_SECRET_KEY set but DATABASE_URL missing; billing routes will fail until DATABASE_URL is set",
      }) + "\n",
    );
  }

  const app = express();

  // Stripe webhook MUST use raw body (before express.json).
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    (req, res) => {
      const db = getLedgerDb();
      if (!db) {
        res.status(500).json({
          error: "billing_misconfigured",
          message: "DATABASE_URL required for Stripe webhooks",
        });
        return;
      }
      handleStripeWebhook(req, res, { db });
    },
  );

  app.use(express.json());

  // Health before host-header guard so Fly/proxy probes always work.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });

  const allowedHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    ...(process.env.ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean) ?? []),
  ];
  const flyApp = process.env.FLY_APP_NAME?.trim();
  if (flyApp) {
    allowedHosts.push(`${flyApp}.fly.dev`);
  }

  app.use(hostHeaderValidation(allowedHosts));

  function attachRequestId(req: Request, _res: Response, next: NextFunction): void {
    req.requestId = (req.header("x-request-id") || randomUUID()).trim();
    next();
  }

  app.get("/billing/success", (req, res) => {
    const sessionId =
      typeof req.query.session_id === "string" ? req.query.session_id : undefined;
    res.type("html").send(renderSuccessPage(sessionId));
  });

  app.get("/billing/cancel", (_req, res) => {
    res.type("html").send(renderCancelPage());
  });

  app.post(
    "/billing/checkout",
    requireBreakGlassApiKey,
    async (req, res) => {
      try {
        requireStripeBillingEnv();
      } catch (err) {
        res.status(500).json({
          error: "billing_misconfigured",
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      const pack = req.body?.pack;
      if (!isCreditPack(pack)) {
        res.status(400).json({
          error: "invalid_pack",
          message: 'Body must include pack: "starter" | "standard" | "pro"',
        });
        return;
      }

      try {
        const { url } = await createCheckoutSession({ pack });
        res.json({ url });
      } catch (err) {
        res.status(502).json({
          error: "checkout_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  app.all("/mcp", attachRequestId, requireApiKey, (req, res) => {
    const store: RequestStore = {
      requestId: req.requestId ?? randomUUID(),
      keyId: req.authContext?.keyId ?? "unknown",
      customerId: req.authContext?.customerId,
      breakGlass: req.authContext?.breakGlass,
    };
    requestStore.run(store, () => {
      void node(req, res, req.body);
    });
  });

  app.listen(PORT, HOST, () => {
    process.stdout.write(
      JSON.stringify({
        type: "server_start",
        name: "research-mcp",
        version: VERSION,
        host: HOST,
        port: PORT,
        mcp: `http://${HOST}:${PORT}/mcp`,
        health: `http://${HOST}:${PORT}/health`,
        billing: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
        ledger: Boolean(process.env.DATABASE_URL?.trim()),
        liveResearch: process.env.LIVE_RESEARCH === "1",
      }) + "\n",
    );
  });
}

main().catch((err) => {
  process.stderr.write(
    JSON.stringify({
      type: "fatal",
      message: err instanceof Error ? err.message : String(err),
    }) + "\n",
  );
  process.exit(1);
});
