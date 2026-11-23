import { createBrowserPage } from "./browser-page.ts";
import { systemClock, type Clock } from "./clock.ts";
import { createBroadcastCrossTab, type CrossTab } from "./cross-tab.ts";
import { TRACKER_DEFAULTS } from "./defaults.ts";
import type { DropReason } from "./drop-reason.ts";
import { parseEventDeclarations, type DeclaredEvents } from "./event-declarations.ts";
import type { FetchLike, SendBeaconLike } from "./fetch-like.ts";
import type { PageEnvironment } from "./page-environment.ts";
import type { RandomSource } from "./random-token.ts";
import { browserStorage, type StorageLike } from "./storage.ts";
import type { TrackerOptions } from "./tracker-types.ts";
import { WRITE_KEY_PATTERN } from "./wire-format.ts";

export interface ResolvedOptions {
  readonly endpoint: string;
  readonly writeKey: string;
  readonly declared: DeclaredEvents;
  readonly consentVersion: number;
  readonly autoPageViews: boolean;
  readonly allowedQueryParameters: ReadonlySet<string>;
  readonly maxStringLength: number;
  readonly maxBatchSize: number;
  readonly flushInterval: number;
  readonly maxPayloadBytes: number;
  readonly maxQueueEvents: number;
  readonly maxQueueBytes: number;
  readonly sessionTimeout: number;
  readonly requestTimeout: number;
  readonly onDrop: (reason: DropReason) => void;
  readonly fetch: FetchLike | undefined;
  readonly sendBeacon: SendBeaconLike | undefined;
  readonly localStorage: StorageLike | undefined;
  readonly sessionStorage: StorageLike | undefined;
  readonly clock: Clock;
  readonly crypto: RandomSource | undefined;
  readonly random: () => number;
  readonly page: PageEnvironment;
  readonly crossTab: CrossTab | undefined;
}

const LOOPBACK_HOSTS: readonly string[] = ["localhost", "127.0.0.1"];
const QUERY_PARAMETER_PATTERN = /^[A-Za-z0-9_.~-]{1,64}$/;

// The key is public by design, but it still stays out of messages: a log line is not its place.
const endpointOf = (value: unknown): string => {
  const reject = (rule: string): never => {
    throw new TypeError(`options.endpoint ${rule}`);
  };
  if (typeof value !== "string") return reject("must be a string");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return reject("must be an absolute URL");
  }
  const loopback = url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    return reject("must be an https: URL (http: only on localhost or 127.0.0.1)");
  }
  if (url.username !== "" || url.password !== "") return reject("must not carry credentials");
  if (url.search !== "" || url.hash !== "")
    return reject("must not have a query string or fragment");
  return url.href;
};

const writeKeyOf = (value: unknown): string => {
  if (typeof value === "string" && WRITE_KEY_PATTERN.test(value)) return value;
  throw new TypeError(`options.writeKey must match ${WRITE_KEY_PATTERN.source}`);
};

const wholeNumber = (
  name: string,
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }
  throw new TypeError(
    `options.${name} must be a whole number from ${String(min)} to ${String(max)}`,
  );
};

const queryParametersOf = (value: unknown): ReadonlySet<string> => {
  if (value === undefined) return new Set();
  if (
    !Array.isArray(value) ||
    !value.every((name) => typeof name === "string" && QUERY_PARAMETER_PATTERN.test(name))
  ) {
    throw new TypeError(
      `options.allowedQueryParameters must be a list of names matching ${QUERY_PARAMETER_PATTERN.source}`,
    );
  }
  return new Set(value as string[]);
};

const defaultFetch = (): FetchLike | undefined =>
  typeof globalThis.fetch === "function"
    ? (input, init) => globalThis.fetch(input, init)
    : undefined;

const defaultSendBeacon = (): SendBeaconLike | undefined => {
  try {
    const navigator = globalThis.navigator as Navigator | undefined;
    return typeof navigator?.sendBeacon === "function"
      ? (url, data) => navigator.sendBeacon(url, data)
      : undefined;
  } catch {
    return undefined;
  }
};

const defaultCrypto = (): RandomSource | undefined => {
  try {
    const source = globalThis.crypto as Crypto | undefined;
    return typeof source?.getRandomValues === "function" ? source : undefined;
  } catch {
    return undefined;
  }
};

// A server-side render has no document: opening a channel there would keep the process alive.
const defaultCrossTab = (): CrossTab | undefined =>
  typeof (globalThis as { document?: unknown }).document === "undefined"
    ? undefined
    : createBroadcastCrossTab();

/** `null` switches an injected thing off; left out, it is the browser's own. */
const injected = <T>(value: T | null | undefined, fallback: () => T | undefined): T | undefined =>
  value === null ? undefined : (value ?? fallback());

/**
 * Checks every option and fills the defaults, throwing a located `TypeError` for anything invalid:
 * a tracker that starts with a wrong endpoint or key would fail silently on every request.
 */
export const resolveOptions = (options: TrackerOptions): ResolvedOptions => {
  if (typeof (options as unknown) !== "object" || (options as unknown) === null) {
    throw new TypeError("createTracker needs an options object");
  }
  const D = TRACKER_DEFAULTS;
  return {
    endpoint: endpointOf(options.endpoint),
    writeKey: writeKeyOf(options.writeKey),
    declared: parseEventDeclarations(options.events),
    consentVersion: wholeNumber(
      "consentVersion",
      options.consentVersion,
      D.consentVersion,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    autoPageViews: options.autoPageViews === true,
    allowedQueryParameters: queryParametersOf(options.allowedQueryParameters),
    maxStringLength: wholeNumber(
      "maxStringLength",
      options.maxStringLength,
      D.maxStringLength,
      1,
      1024,
    ),
    maxBatchSize: wholeNumber("maxBatchSize", options.maxBatchSize, D.maxBatchSize, 1, 500),
    flushInterval: wholeNumber(
      "flushInterval",
      options.flushInterval,
      D.flushInterval,
      1,
      86_400_000,
    ),
    maxPayloadBytes: wholeNumber(
      "maxPayloadBytes",
      options.maxPayloadBytes,
      D.maxPayloadBytes,
      1024,
      65_536,
    ),
    maxQueueEvents: wholeNumber(
      "maxQueueEvents",
      options.maxQueueEvents,
      D.maxQueueEvents,
      1,
      10_000,
    ),
    maxQueueBytes: wholeNumber(
      "maxQueueBytes",
      options.maxQueueBytes,
      D.maxQueueBytes,
      1024,
      4_194_304,
    ),
    sessionTimeout: wholeNumber(
      "sessionTimeout",
      options.sessionTimeout,
      D.sessionTimeout,
      1000,
      86_400_000,
    ),
    requestTimeout: wholeNumber(
      "requestTimeout",
      options.requestTimeout,
      D.requestTimeout,
      1000,
      600_000,
    ),
    onDrop: options.onDrop ?? (() => undefined),
    fetch: injected(options.fetch, defaultFetch),
    sendBeacon: injected(options.sendBeacon, defaultSendBeacon),
    localStorage: injected(options.localStorage, () => browserStorage("localStorage")),
    sessionStorage: injected(options.sessionStorage, () => browserStorage("sessionStorage")),
    clock: options.clock ?? systemClock,
    crypto: injected(options.crypto, defaultCrypto),
    random: options.random ?? Math.random,
    page: options.page ?? createBrowserPage(),
    crossTab: injected(options.crossTab, defaultCrossTab),
  };
};
