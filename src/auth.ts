import type { Request, Response, NextFunction } from "express";
import { getLedgerDb } from "./billing/db.js";
import { findActiveKeyByHash, hashApiKey } from "./billing/keys.js";

export interface AuthContext {
  apiKey: string;
  keyId: string;
  /** Set for customer (ledger) keys */
  customerId?: string;
  /** True when authenticated via env API_KEYS (ops; no ledger debit) */
  breakGlass: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
      requestId?: string;
    }
  }
}

function parseApiKeys(raw: string | undefined): Set<string> {
  if (!raw || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );
}

export function getConfiguredApiKeys(): Set<string> {
  return parseApiKeys(process.env.API_KEYS);
}

/** Extract Bearer token or X-API-Key header. */
export function extractApiKey(req: Request): string | undefined {
  const xKey = req.header("x-api-key")?.trim();
  if (xKey) return xKey;

  const auth = req.header("authorization");
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim();
}

function keyIdFromPresented(presented: string): string {
  if (presented.length <= 4) return `****${presented}`;
  return `...${presented.slice(-4)}`;
}

/**
 * Resolve presented key against env API_KEYS (break-glass) OR active api_keys hash.
 */
export function resolveAuth(presented: string): AuthContext | null {
  const keys = getConfiguredApiKeys();
  if (keys.has(presented)) {
    return {
      apiKey: presented,
      keyId: keyIdFromPresented(presented),
      breakGlass: true,
    };
  }

  const db = getLedgerDb();
  if (db) {
    const row = findActiveKeyByHash(db, hashApiKey(presented));
    if (row) {
      return {
        apiKey: presented,
        keyId: row.key_prefix,
        customerId: row.customer_id,
        breakGlass: false,
      };
    }
  }

  return null;
}

/**
 * Require Authorization: Bearer <key> OR X-API-Key.
 * Dual path: env API_KEYS (break-glass) OR active customer key hash in ledger DB.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const keys = getConfiguredApiKeys();
  const db = getLedgerDb();

  if (keys.size === 0 && !db) {
    res.status(500).json({
      error: "server_misconfigured",
      message: "API_KEYS env is empty and no ledger DB; no keys configured",
    });
    return;
  }

  const presented = extractApiKey(req);
  if (!presented) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key.",
    });
    return;
  }

  const ctx = resolveAuth(presented);
  if (!ctx) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key.",
    });
    return;
  }

  req.authContext = ctx;
  next();
}

/** Checkout start: break-glass API_KEYS only (alpha). */
export function requireBreakGlassApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const keys = getConfiguredApiKeys();
  if (keys.size === 0) {
    res.status(500).json({
      error: "server_misconfigured",
      message: "API_KEYS env is empty; break-glass required for checkout",
    });
    return;
  }
  const presented = extractApiKey(req);
  if (!presented || !keys.has(presented)) {
    res.status(401).json({
      error: "unauthorized",
      message: "Checkout requires a break-glass API_KEYS credential",
    });
    return;
  }
  req.authContext = {
    apiKey: presented,
    keyId: keyIdFromPresented(presented),
    breakGlass: true,
  };
  next();
}
