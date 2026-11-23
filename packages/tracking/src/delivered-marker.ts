import {
  readItem,
  removeItem,
  removeItemIfPresent,
  writeItem,
  type StorageLike,
} from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import { MAX_TIMESTAMP, TOKEN_PATTERN, WIRE_VERSION } from "./wire-format.ts";

const MAX_IDS = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_CHARACTERS = 30_000;

type Delivered = readonly (readonly [string, number])[];

const parse = (text: string): Delivered | undefined => {
  if (text.length > MAX_STORED_CHARACTERS) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  if (Object.keys(parsed).sort().join(",") !== "ids,v") return undefined;
  const { v, ids } = parsed as Record<string, unknown>;
  if (v !== WIRE_VERSION || !Array.isArray(ids) || ids.length > MAX_IDS) return undefined;
  const checked: [string, number][] = [];
  for (const item of ids as unknown[]) {
    if (!Array.isArray(item) || item.length !== 2) return undefined;
    const [id, at] = item as unknown[];
    if (typeof id !== "string" || !TOKEN_PATTERN.test(id)) return undefined;
    if (typeof at !== "number" || !Number.isInteger(at) || at < 0 || at > MAX_TIMESTAMP) {
      return undefined;
    }
    checked.push([id, at]);
  }
  return checked;
};

const recent = (held: Delivered, now: number): Delivered =>
  held.filter(([, at]) => at >= now - MAX_AGE_MS);

const readHeld = (storage: StorageLike | undefined): Delivered => {
  const text = readItem(storage, STORAGE_KEYS.delivered);
  if (text === undefined) return [];
  const held = parse(text);
  if (held === undefined) {
    removeItem(storage, STORAGE_KEYS.delivered);
    return [];
  }
  return held;
};

/** The ids some tab delivered in the last 24 hours. Anything malformed is discarded. */
export const readDeliveredIds = (storage: StorageLike | undefined, now: number): Set<string> =>
  new Set(recent(readHeld(storage), now).map(([id]) => id));

/** Adds ids delivered now; at most 200 are kept, the newest, and none older than 24 hours. */
export const recordDeliveredIds = (
  storage: StorageLike | undefined,
  ids: readonly string[],
  now: number,
): void => {
  const known = new Set(ids);
  const kept = [
    ...recent(readHeld(storage), now).filter(([id]) => !known.has(id)),
    ...ids.map((id): [string, number] => [id, now]),
  ].slice(-MAX_IDS);
  writeItem(storage, STORAGE_KEYS.delivered, JSON.stringify({ v: WIRE_VERSION, ids: kept }));
};

export const removeDeliveredIds = (storage: StorageLike | undefined): boolean =>
  removeItemIfPresent(storage, STORAGE_KEYS.delivered);
