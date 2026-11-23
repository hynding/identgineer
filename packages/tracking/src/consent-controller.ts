import {
  parseConsentRecord,
  serialiseConsentRecord,
  type ConsentChoice,
} from "./consent-record.ts";
import type { NavigatorSignals } from "./page-environment.ts";
import { readItem, removeItem, writeItem, type StorageLike } from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import type { ConsentState, ConsentStatus } from "./tracker-types.ts";

export interface ConsentControllerDeps {
  readonly storage: StorageLike | undefined;
  readonly version: number;
  readonly now: () => number;
  readonly signals: () => NavigatorSignals;
}

export interface ConsentController {
  /** The effective consent right now, read afresh from the signals and from storage. */
  readonly read: () => ConsentStatus;
  readonly grant: () => boolean;
  readonly deny: () => boolean;
  readonly reset: () => boolean;
}

const signalReason = (signals: NavigatorSignals): "gpc" | "dnt" | undefined => {
  if (signals.globalPrivacyControl === true) return "gpc";
  return signals.doNotTrack === "1" ? "dnt" : undefined;
};

const readSignals = (signals: () => NavigatorSignals): NavigatorSignals => {
  try {
    return signals();
  } catch {
    return {};
  }
};

/**
 * Reads and writes the one consent record. Storage is the truth, read at every use: a failing
 * read is `unknown`, and a browser signal overrides whatever was stored. A denial or a reset that
 * could not be written is remembered in memory, so the grant still in storage cannot come back.
 */
export const createConsentController = (deps: ConsentControllerDeps): ConsentController => {
  let override: "denied" | "unknown" | undefined;

  const store = (choice: ConsentChoice): boolean => {
    const stored = writeItem(
      deps.storage,
      STORAGE_KEYS.consent,
      serialiseConsentRecord({ state: choice, version: deps.version, decidedAt: deps.now() }),
    );
    if (stored) override = undefined;
    return stored;
  };

  return {
    read: () => {
      const reason = signalReason(readSignals(deps.signals));
      if (reason !== undefined) return { state: "denied", reason };
      const text = readItem(deps.storage, STORAGE_KEYS.consent);
      const stored = text === undefined ? undefined : parseConsentRecord(text, deps.version);
      const state: ConsentState = stored?.state ?? "unknown";
      return { state: state === "granted" && override !== undefined ? override : state };
    },
    grant: () => store("granted"),
    deny: () => {
      const stored = store("denied");
      if (!stored) override = "denied";
      return stored;
    },
    reset: () => {
      const removed = removeItem(deps.storage, STORAGE_KEYS.consent);
      if (removed) override = undefined;
      else override = "unknown";
      return removed;
    },
  };
};
