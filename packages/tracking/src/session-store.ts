import type { Clock } from "./clock.ts";
import { randomToken, type RandomSource } from "./random-token.ts";
import { readItem, removeItemIfPresent, writeItem, type StorageLike } from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import { MAX_TIMESTAMP, TOKEN_PATTERN } from "./wire-format.ts";

export interface SessionStoreDeps {
  readonly storage: StorageLike | undefined;
  readonly clock: Clock;
  readonly crypto: RandomSource | undefined;
  /** Milliseconds without an event after which the session id changes. */
  readonly timeout: number;
}

export interface SessionStore {
  /** The current session id, extended by this event or started anew; `undefined` without randomness. */
  readonly current: () => string | undefined;
  /** Forgets the session, in memory and in storage, so the next event starts another. */
  readonly clear: () => void;
}

interface Session {
  readonly id: string;
  last: number;
}

const readStored = (storage: StorageLike | undefined): Session | undefined => {
  const text = readItem(storage, STORAGE_KEYS.session);
  if (text === undefined || text.length > 200) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  if (Object.keys(parsed).sort().join(",") !== "id,last") return undefined;
  const { id, last } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || !TOKEN_PATTERN.test(id)) return undefined;
  if (typeof last !== "number" || !Number.isInteger(last) || last < 0 || last > MAX_TIMESTAMP) {
    return undefined;
  }
  return { id, last };
};

/**
 * One random session id per tab, kept in `sessionStorage` (never a cookie, never `localStorage`)
 * and replaced after a period without events. Nothing here outlives the tab or links two visits.
 */
export const createSessionStore = (deps: SessionStoreDeps): SessionStore => {
  let session: Session | undefined;
  let loaded = false;

  return {
    current: () => {
      if (!loaded) {
        loaded = true;
        session = readStored(deps.storage);
      }
      const now = deps.clock.now();
      if (session === undefined || now - session.last > deps.timeout) {
        const id = randomToken(deps.crypto);
        if (id === undefined) return undefined;
        session = { id, last: now };
      } else {
        session.last = now;
      }
      writeItem(
        deps.storage,
        STORAGE_KEYS.session,
        JSON.stringify({ id: session.id, last: session.last }),
      );
      return session.id;
    },
    clear: () => {
      session = undefined;
      loaded = true;
      removeItemIfPresent(deps.storage, STORAGE_KEYS.session);
    },
  };
};
