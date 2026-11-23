import { describe, expect, it } from "vitest";
import type { ConsentStatus } from "./tracker-types.ts";
import { CONSENT_KEY, createWorld, openTab, START } from "./test-harness.ts";
import type { MemoryStorage } from "./testing/memory-storage.ts";

/**
 * What one tab sees of another's write when the two reach it by different paths: a notice on the
 * channel can come before the storage write is visible, so a read made at the notice finds the old
 * value. Reads of the frozen keys answer from the moment `lag` was called until `catchUp`.
 */
function laggingView(source: MemoryStorage) {
  const frozen = new Map<string, string | null>();
  return {
    storage: {
      getItem: (key: string) => (frozen.has(key) ? (frozen.get(key) ?? null) : source.getItem(key)),
      setItem: (key: string, value: string) => {
        source.setItem(key, value);
      },
      removeItem: (key: string) => {
        source.removeItem(key);
      },
    },
    lag: (key: string) => {
      frozen.set(key, source.peek(key));
    },
    catchUp: () => {
      frozen.clear();
    },
  };
}

function twoTabs() {
  const world = createWorld();
  const view = laggingView(world.local);
  const a = openTab(world);
  const b = openTab(world, { localStorage: view.storage });
  const heard: ConsentStatus[] = [];
  b.tracker.consent.onChange((status) => heard.push(status));
  return { world, view, a, b, heard };
}

describe("a consent change in another tab whose notice arrives before its write is visible", () => {
  it("is heard at the storage event that follows", () => {
    const { view, a, b, heard } = twoTabs();
    view.lag(CONSENT_KEY);
    a.tracker.consent.grant();
    expect(heard).toEqual([]);
    view.catchUp();
    b.page.changeStorage(CONSENT_KEY);
    expect(heard).toMatchObject([{ state: "granted", decidedAt: START }]);
    expect(b.tracker.consent.get()).toMatchObject({ state: "granted" });
  });

  it("is heard for a reset, which removes the key", () => {
    const { world, view, a, b, heard } = twoTabs();
    a.tracker.consent.grant();
    expect(heard).toMatchObject([{ state: "granted" }]);
    view.lag(CONSENT_KEY);
    a.tracker.consent.reset();
    expect(world.local.peek(CONSENT_KEY)).toBeNull();
    expect(heard).toHaveLength(1);
    view.catchUp();
    b.page.changeStorage(CONSENT_KEY);
    expect(heard).toMatchObject([{ state: "granted" }, { state: "unknown" }]);
  });

  it("is heard when the whole storage is cleared", () => {
    const { view, a, b, heard } = twoTabs();
    view.lag(CONSENT_KEY);
    a.tracker.consent.deny();
    view.catchUp();
    b.page.changeStorage(null);
    expect(heard).toMatchObject([{ state: "denied" }]);
  });

  it("ignores a change to a key that is not the consent record", () => {
    const { view, a, b, heard } = twoTabs();
    view.lag(CONSENT_KEY);
    a.tracker.consent.grant();
    view.catchUp();
    b.page.changeStorage("some.other.key");
    expect(heard).toEqual([]);
  });

  it("stops listening for storage events once the tracker is disposed", () => {
    const { view, a, b, heard } = twoTabs();
    b.tracker.dispose();
    view.lag(CONSENT_KEY);
    a.tracker.consent.grant();
    view.catchUp();
    b.page.changeStorage(CONSENT_KEY);
    expect(heard).toEqual([]);
    expect(b.page.listenerCount()).toBe(0);
  });
});

describe("a decision made again in another tab", () => {
  it("is told to the listeners, with the new time, though the state is the same", () => {
    const { world, a, heard } = twoTabs();
    a.tracker.consent.grant();
    expect(heard).toMatchObject([{ state: "granted", decidedAt: START }]);
    world.clock.advance(60_000);
    a.tracker.consent.grant();
    expect(heard).toMatchObject([
      { state: "granted", decidedAt: START },
      { state: "granted", decidedAt: START + 60_000 },
    ]);
  });

  it("is not told twice for the same decision, nor for a tab's own repeat", () => {
    const world = createWorld();
    const tab = openTab(world);
    const heard: ConsentStatus[] = [];
    tab.tracker.consent.onChange((status) => heard.push(status));
    tab.tracker.consent.grant();
    tab.tracker.consent.grant();
    tab.tracker.consent.get();
    expect(heard).toHaveLength(1);
  });
});
