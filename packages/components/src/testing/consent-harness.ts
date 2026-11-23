import { afterEach } from "vitest";
import { createTracker, type Tracker } from "@identgineer/tracking";
import {
  createCrossTabHub,
  createFakeCollector,
  createFakePage,
  createManualClock,
  createMemoryStorage,
  createSeededRandom,
} from "@identgineer/tracking/testing";

const ENDPOINT = "https://collect.example.com/v1/events";
const WRITE_KEY = "wk_0123456789abcdef";
export const START = Date.UTC(2026, 2, 1, 12, 0, 0);

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

export interface TrackerSetupOptions {
  readonly gpc?: boolean;
  readonly dnt?: string;
}

/**
 * The real tracker on the SDK's own fakes (a page, a storage, a clock, a collector), as the
 * components meet it in a page. Browser signals are set on the fake page.
 */
export function trackerSetup(options: TrackerSetupOptions = {}) {
  const page = createFakePage();
  if (options.gpc !== undefined) page.setGpc(options.gpc);
  if (options.dnt !== undefined) page.setDnt(options.dnt);
  const collector = createFakeCollector({ endpoint: ENDPOINT, writeKey: WRITE_KEY });
  const hub = createCrossTabHub();
  const seeded = createSeededRandom(1);
  const clock = createManualClock(START);
  const local = createMemoryStorage();
  const makeTracker = (): Tracker => {
    const tracker = createTracker({
      endpoint: ENDPOINT,
      writeKey: WRITE_KEY,
      events: { clicked: { properties: {} } },
      fetch: collector.fetch,
      sendBeacon: collector.sendBeacon,
      localStorage: local,
      sessionStorage: createMemoryStorage(),
      clock,
      crypto: seeded.crypto,
      random: seeded.random,
      page,
      crossTab: hub.connect(),
    });
    disposers.push(tracker.dispose);
    return tracker;
  };
  return { tracker: makeTracker(), makeTracker, page, collector, local, clock };
}
