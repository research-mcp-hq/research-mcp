import { createHash, randomBytes } from "node:crypto";
import type { LedgerDb, LedgerTx } from "./db.js";

const KEY_PREFIX = "rmcp_";

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function generateApiKey(): { plaintext: string; keyHash: string; keyPrefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, 12);
  return { plaintext, keyHash, keyPrefix };
}

export interface StoredApiKey {
  key_hash: string;
  key_prefix: string;
  customer_id: string;
  status: string;
  created_at: string;
}

export function findActiveKeyForCustomer(
  db: LedgerDb | LedgerTx,
  customerId: string,
): StoredApiKey | undefined {
  return db.get<StoredApiKey>(
    `SELECT key_hash, key_prefix, customer_id, status, created_at
     FROM api_keys
     WHERE customer_id = ? AND status = 'active'
     LIMIT 1`,
    [customerId],
  );
}

export function findActiveKeyByHash(
  db: LedgerDb,
  keyHash: string,
): StoredApiKey | undefined {
  return db.get<StoredApiKey>(
    `SELECT key_hash, key_prefix, customer_id, status, created_at
     FROM api_keys
     WHERE key_hash = ? AND status = 'active'
     LIMIT 1`,
    [keyHash],
  );
}

/**
 * Ensure customer has an active API key. Reuses existing; otherwise generates
 * a new one. Returns plaintext only when newly created.
 */
export function ensureCustomerApiKey(
  db: LedgerDb | LedgerTx,
  customerId: string,
  nowIso: string = new Date().toISOString(),
): { plaintext: string | null; keyPrefix: string; created: boolean } {
  const existing = findActiveKeyForCustomer(db, customerId);
  if (existing) {
    return {
      plaintext: null,
      keyPrefix: existing.key_prefix,
      created: false,
    };
  }
  const { plaintext, keyHash, keyPrefix } = generateApiKey();
  db.run(
    `INSERT INTO api_keys (key_hash, key_prefix, customer_id, status, created_at)
     VALUES (?, ?, ?, 'active', ?)`,
    [keyHash, keyPrefix, customerId, nowIso],
  );
  return { plaintext, keyPrefix, created: true };
}
