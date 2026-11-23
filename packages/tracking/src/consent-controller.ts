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

export interface ConsentReading {
  /** The effective consent right now, read afresh from the signals and from storage. */
  readonly status: ConsentStatus;
  /**
   * When the stored decision was made. A change of it, with the state still granted, means the
   * visitor denied and granted again somewhere this tab did not hear of.
   */
  readonly decidedAt: number | undefined;
}

export interface ConsentController {
  readonly read: () => ConsentReading;
  /** Refused, and nothing is stored, while a browser signal is set. */
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

  const readStored = () => {
    const text = readItem(deps.storage, STORAGE_KEYS.consent);
    return text === undefined ? undefined : parseConsentRecord(text, deps.version);
  };

  const store = (choice: ConsentChoice): boolean => {
    // Strictly after the decision it replaces, so that two decisions in one millisecond differ.
    const previous = readStored()?.decidedAt ?? -1;
    const decidedAt = Math.max(deps.now(), previous + 1);
    const stored = writeItem(
      deps.storage,
      STORAGE_KEYS.consent,
      serialiseConsentRecord({ state: choice, version: deps.version, decidedAt }),
    );
    if (stored) override = undefined;
    return stored;
  };

  return {
    read: () => {
      const reason = signalReason(readSignals(deps.signals));
      const stored = readStored();
      const decidedAt = stored?.decidedAt;
      if (reason !== undefined) return { status: { state: "denied", reason }, decidedAt };
      const state: ConsentState = stored?.state ?? "unknown";
      return {
        status: { state: state === "granted" && override !== undefined ? override : state },
        decidedAt,
      };
    },
    grant: () => signalReason(readSignals(deps.signals)) === undefined && store("granted"),
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
