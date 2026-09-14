/**
 * SQLite ledger via sql.js (pure JS/WASM).
 *
 * Choice: better-sqlite3 native build failed on this Node 20 box (no `make` /
 * node-gyp toolchain). node:sqlite requires Node 22+. sql.js is pure JS and
 * works here; we persist the DB file after mutations when DATABASE_URL is
 * file-backed.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { parseSqlitePath } from "./config.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  checkout_session_id TEXT,
  usage_request_id TEXT,
  sku TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  key_prefix TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_checkout_session
  ON ledger_entries(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_customer
  ON api_keys(customer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON api_keys(key_prefix);
`;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

export class LedgerDb {
  private db: Database;
  private filePath: string | null;
  private dirty = false;

  private constructor(db: Database, filePath: string | null) {
    this.db = db;
    this.filePath = filePath;
  }

  static async open(databaseUrl: string): Promise<LedgerDb> {
    const SQL = await loadSqlJs();
    const relOrAbs = parseSqlitePath(databaseUrl);
    let filePath: string | null = null;
    let db: Database;

    if (relOrAbs === null) {
      db = new SQL.Database();
    } else {
      filePath = resolve(relOrAbs);
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (existsSync(filePath)) {
        const buf = readFileSync(filePath);
        db = new SQL.Database(buf);
      } else {
        db = new SQL.Database();
      }
    }

    const ledger = new LedgerDb(db, filePath);
    ledger.migrate();
    ledger.persist();
    return ledger;
  }

  /** In-memory DB for tests (no file). */
  static async openMemory(): Promise<LedgerDb> {
    return LedgerDb.open(":memory:");
  }

  migrate(): void {
    this.db.run(SCHEMA_SQL);
    this.dirty = true;
  }

  persist(): void {
    if (!this.filePath || !this.dirty) return;
    const data = this.db.export();
    writeFileSync(this.filePath, Buffer.from(data));
    this.dirty = false;
  }

  /** Run a mutation and persist. */
  run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as never[]);
    this.dirty = true;
    this.persist();
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.dirty = true;
    this.persist();
  }

  get<T extends object>(
    sql: string,
    params: unknown[] = [],
  ): T | undefined {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never[]);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  all<T extends object>(
    sql: string,
    params: unknown[] = [],
  ): T[] {
    const stmt = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params as never[]);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  /**
   * Run multiple statements without intermediate persist; persist once at end.
   * Callback receives helpers that do not auto-persist.
   */
  transaction<T>(fn: (tx: LedgerTx) => T): T {
    const tx = new LedgerTx(this.db);
    try {
      this.db.run("BEGIN");
      const result = fn(tx);
      this.db.run("COMMIT");
      this.dirty = true;
      this.persist();
      return result;
    } catch (err) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  close(): void {
    this.persist();
    this.db.close();
  }
}

/** Transaction-scoped helpers (no persist until outer commit). */
export class LedgerTx {
  constructor(private db: Database) {}

  run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as never[]);
  }

  get<T extends object>(
    sql: string,
    params: unknown[] = [],
  ): T | undefined {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never[]);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }
}

let singleton: LedgerDb | null = null;

export async function initLedgerDb(databaseUrl?: string): Promise<LedgerDb | null> {
  const url = databaseUrl ?? process.env.DATABASE_URL?.trim();
  if (!url) {
    singleton = null;
    return null;
  }
  singleton = await LedgerDb.open(url);
  return singleton;
}

export function getLedgerDb(): LedgerDb | null {
  return singleton;
}

export function setLedgerDbForTests(db: LedgerDb | null): void {
  singleton = db;
}

export function requireLedgerDb(): LedgerDb {
  if (!singleton) {
    throw new Error(
      "DATABASE_URL is required when billing is enabled (e.g. file:./data/ledger.sqlite)",
    );
  }
  return singleton;
}
