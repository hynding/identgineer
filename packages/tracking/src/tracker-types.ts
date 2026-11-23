import type { Clock } from "./clock.ts";
import type { CrossTab } from "./cross-tab.ts";
import type { DropReason } from "./drop-reason.ts";
import type { EventDeclaration } from "./event-declarations.ts";
import type { FetchLike, SendBeaconLike } from "./fetch-like.ts";
import type { PageEnvironment, Unsubscribe } from "./page-environment.ts";
import type { RandomSource } from "./random-token.ts";
import type { StorageLike } from "./storage.ts";

export type ConsentState = "unknown" | "granted" | "denied";

export interface ConsentStatus {
  /** What the tracker acts on: `denied` while a browser signal says so, whatever was stored. */
  readonly state: ConsentState;
  /** Set only while `state` is `denied` because of a browser signal. */
  readonly reason?: "gpc" | "dnt";
}

export interface ConsentApi {
  readonly get: () => ConsentStatus;
  /** Records the choice; returns whether it could be stored. A browser signal still wins. */
  readonly grant: () => boolean;
  readonly deny: () => boolean;
  /** Forgets the choice, and everything the SDK stored: the visitor is asked again. */
  readonly reset: () => boolean;
  readonly onChange: (listener: (status: ConsentStatus) => void) => Unsubscribe;
}

export interface PageOverrides {
  /** A path or URL to record instead of the current one; reduced like any URL. */
  readonly path?: string;
  /** A referrer to record instead of `document.referrer`; reduced to its origin. */
  readonly referrer?: string;
}

export interface Tracker {
  readonly consent: ConsentApi;
  readonly track: (name: string, properties?: Readonly<Record<string, unknown>>) => void;
  readonly page: (overrides?: PageOverrides) => void;
  /** An opaque id (`[A-Za-z0-9_-]{1,64}`), never an email or a name; `null` clears it. */
  readonly identify: (id: string | null) => void;
  readonly flush: () => Promise<void>;
  readonly dispose: () => void;
}

export interface TrackerOptions {
  /** Absolute `https:` URL (or `http:` on `localhost` / `127.0.0.1`). */
  readonly endpoint: string;
  /** The public, write-only key, `[A-Za-z0-9_-]{16,128}`. */
  readonly writeKey: string;
  /** Every event the page may record, with the type of each of its properties. */
  readonly events: Readonly<Record<string, EventDeclaration>>;
  readonly consentVersion?: number;
  readonly autoPageViews?: boolean;
  readonly allowedQueryParameters?: readonly string[];
  readonly maxStringLength?: number;
  readonly maxBatchSize?: number;
  readonly flushInterval?: number;
  readonly maxPayloadBytes?: number;
  readonly maxQueueEvents?: number;
  readonly maxQueueBytes?: number;
  readonly sessionTimeout?: number;
  /** Milliseconds before a request that has no answer is aborted and retried. */
  readonly requestTimeout?: number;
  /** Told why an event, a property or a batch was dropped. Never thrown to the page. */
  readonly onDrop?: (reason: DropReason) => void;
  /** The rest is what the SDK reads from its environment, injectable; `null` switches one off. */
  readonly fetch?: FetchLike | null;
  readonly sendBeacon?: SendBeaconLike | null;
  readonly localStorage?: StorageLike | null;
  readonly sessionStorage?: StorageLike | null;
  readonly clock?: Clock;
  readonly crypto?: RandomSource | null;
  /** Jitter for the retry delay only; identifiers never come from it. */
  readonly random?: () => number;
  readonly page?: PageEnvironment;
  readonly crossTab?: CrossTab | null;
}
