import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Request, Response, NextFunction } from "express";
import { requireApiKey } from "./auth.js";
import { createResearchMcpServer } from "./server.js";
import { StdoutUsageLogger } from "./usage.js";
import { VERSION } from "./version.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const usage = new StdoutUsageLogger();

interface RequestStore {
  requestId: string;
  keyId: string;
}

const requestStore = new AsyncLocalStorage<RequestStore>();

const mcpHandler = createMcpHandler(() => {
  const store = requestStore.getStore();
  const requestId = store?.requestId ?? randomUUID();
  const keyId = store?.keyId ?? "unknown";
  return createResearchMcpServer({ requestId, keyId, usage });
});

const node = toNodeHandler(mcpHandler);

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"],
});

function attachRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.header("x-request-id") || randomUUID()).trim();
  next();
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: VERSION });
});

app.all(
  "/mcp",
  attachRequestId,
  requireApiKey,
  (req, res) => {
    const store: RequestStore = {
      requestId: req.requestId ?? randomUUID(),
      keyId: req.authContext?.keyId ?? "unknown",
    };
    requestStore.run(store, () => {
      void node(req, res, req.body);
    });
  },
);

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
      liveResearch: process.env.LIVE_RESEARCH === "1",
    }) + "\n",
  );
});
