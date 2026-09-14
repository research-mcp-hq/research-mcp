/**
 * One-time plaintext API key reveal keyed by checkout session id.
 * In-memory with TTL; alpha-only (not durable across restarts).
 */

export interface RevealPayload {
  plaintextKey: string | null;
  creditsCents: number;
  pack: string;
  customerId: string;
  keyPrefix: string;
  revealed: boolean;
  createdAt: number;
  /** True when key was reused (already had active key). */
  keyReused: boolean;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, RevealPayload>();

export function stashReveal(
  sessionId: string,
  payload: Omit<RevealPayload, "revealed" | "createdAt">,
): void {
  store.set(sessionId, {
    ...payload,
    revealed: false,
    createdAt: Date.now(),
  });
}

export function peekReveal(sessionId: string): RevealPayload | undefined {
  const entry = store.get(sessionId);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > DEFAULT_TTL_MS) {
    store.delete(sessionId);
    return undefined;
  }
  return entry;
}

/** Consume one-time reveal. Returns payload with plaintext only on first call. */
export function consumeReveal(sessionId: string): {
  status: "ok" | "already_revealed" | "missing";
  payload?: RevealPayload;
  plaintextKey?: string | null;
} {
  const entry = peekReveal(sessionId);
  if (!entry) return { status: "missing" };
  if (entry.revealed) {
    return {
      status: "already_revealed",
      payload: { ...entry, plaintextKey: null },
    };
  }
  entry.revealed = true;
  const plaintextKey = entry.plaintextKey;
  entry.plaintextKey = null; // drop plaintext after reveal
  return { status: "ok", payload: entry, plaintextKey };
}

export function clearRevealStoreForTests(): void {
  store.clear();
}
