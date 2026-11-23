import { createTracker } from "./create-tracker.ts";
import type { DropReason } from "./drop-reason.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import type { Tracker, TrackerOptions } from "./tracker-types.ts";
import { createFakeCollector, type FakeCollector } from "./testing/fake-collector.ts";
import { createCrossTabHub, type CrossTabHub } from "./testing/fake-cross-tab.ts";
import { createFakePage, type FakePage } from "./testing/fake-page.ts";
import { createManualClock, type ManualClock } from "./testing/manual-clock.ts";
import { createMemoryStorage, type MemoryStorage } from "./testing/memory-storage.ts";
import { createSeededRandom, type SeededRandom } from "./testing/seeded-random.ts";

export const ENDPOINT = "https://collect.example.com/v1/events";
export const WRITE_KEY = "wk_0123456789abcdef";
export const START = Date.UTC(2026, 2, 1, 12, 0, 0);
export const HOME = "https://shop.example.com/";
export const CONSENT_KEY = STORAGE_KEYS.consent;
export const QUEUE_KEY = STORAGE_KEYS.queue;
export const SESSION_KEY = STORAGE_KEYS.session;

export const EVENTS = {
  signup_completed: { properties: { plan: "string", seats: "number", trial: "boolean" } },
  clicked: { properties: { target: "string" } },
  logout: { properties: {} },
  wide: {
    properties: { a: "string", b: "string", c: "string", d: "string", e: "string" },
  },
} as const;

/** What a page's tabs share: one browser clock, one network, one `localStorage`, one channel. */
export interface World {
  readonly clock: ManualClock;
  readonly collector: FakeCollector;
  readonly local: MemoryStorage;
  readonly hub: CrossTabHub;
  readonly seeded: SeededRandom;
}

export const createWorld = (options: { seed?: number; manualHub?: boolean } = {}): World => ({
  clock: createManualClock(START),
  collector: createFakeCollector({ endpoint: ENDPOINT, writeKey: WRITE_KEY }),
  local: createMemoryStorage(),
  hub: createCrossTabHub({ manual: options.manualHub === true }),
  seeded: createSeededRandom(options.seed ?? 1),
});

export interface Tab {
  readonly world: World;
  readonly tracker: Tracker;
  readonly page: FakePage;
  readonly session: MemoryStorage;
  readonly drops: DropReason[];
}

export interface TabOptions extends Partial<TrackerOptions> {
  readonly href?: string;
  readonly referrer?: string;
  readonly gpc?: boolean;
  readonly dnt?: string;
  readonly session?: MemoryStorage;
}

export const openTab = (world: World, options: TabOptions = {}): Tab => {
  const { href, referrer, gpc, dnt, session: given, ...overrides } = options;
  const page = createFakePage({ href: href ?? HOME, referrer: referrer ?? "" });
  if (gpc !== undefined) page.setGpc(gpc);
  if (dnt !== undefined) page.setDnt(dnt);
  const session = given ?? createMemoryStorage();
  const drops: DropReason[] = [];
  const tracker = createTracker({
    endpoint: ENDPOINT,
    writeKey: WRITE_KEY,
    events: EVENTS,
    fetch: world.collector.fetch,
    sendBeacon: world.collector.sendBeacon,
    localStorage: world.local,
    sessionStorage: session,
    clock: world.clock,
    crypto: world.seeded.crypto,
    random: world.seeded.random,
    page,
    crossTab: world.hub.connect(),
    onDrop: (reason) => drops.push(reason),
    ...overrides,
  });
  return { world, tracker, page, session, drops };
};

/** A tab whose visitor has granted consent. */
export const grantedTab = (world: World, options: TabOptions = {}): Tab => {
  const tab = openTab(world, options);
  tab.tracker.consent.grant();
  return tab;
};

/** A tab opened by a visitor who granted consent on an earlier visit. */
export const returningTab = (world: World, options: TabOptions = {}): Tab => {
  world.local.seed(CONSENT_KEY, consentRecord("granted"));
  return openTab(world, options);
};

export const consentRecord = (
  state: "granted" | "denied",
  version = 1,
  decidedAt = START,
): string => JSON.stringify({ state, version, decidedAt });

/** Lets the fake network's answers and the SDK's promise chains run. */
export const settle = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

/** The keys written (or removed) in a storage since `from` calls ago. */
export const changesSince = (storage: MemoryStorage, from: number) =>
  storage.calls
    .slice(from)
    .filter((call) => call.method !== "getItem")
    .map((call) => `${call.method} ${call.key}`);

export const sessionIdsSent = (world: World): string[] => [
  ...new Set(
    world.collector
      .deliveredEvents()
      .flatMap((event) => (event.session === undefined ? [] : [event.session])),
  ),
];
