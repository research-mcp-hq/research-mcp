import type { Request, Response, NextFunction } from "express";

export interface AuthContext {
  apiKey: string;
  keyId: string;
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

/**
 * Require Authorization: Bearer <key> OR X-API-Key.
 * Keys come from env API_KEYS (comma-separated).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const keys = getConfiguredApiKeys();
  if (keys.size === 0) {
    res.status(500).json({
      error: "server_misconfigured",
      message: "API_KEYS env is empty; no keys configured",
    });
    return;
  }

  const presented = extractApiKey(req);
  if (!presented || !keys.has(presented)) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key.",
    });
    return;
  }

  const keyId =
    presented.length <= 4 ? `****${presented}` : `...${presented.slice(-4)}`;
  req.authContext = { apiKey: presented, keyId };
  next();
}
