import { describe, expect, it } from "vitest";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  SESSION_KEY,
  changesSince,
  consentRecord,
  createWorld,
  grantedTab,
  openTab,
  settle,
  type Tab,
  type World,
} from "./test-harness.ts";

/*
 * The acceptance test: with consent unknown, denied, or granted but overridden by Global Privacy
 * Control or Do Not Track, no public method and no moment of the tracker's life sends anything or
 * writes any key beyond the consent record of an explicit choice.
 */

const seeded = (world: World, state: "granted" | "denied"): void => {
  world.local.seed(CONSENT_KEY, consentRecord(state));
};

const SCENARIOS: readonly (readonly [string, (world: World) => Tab])[] = [
  ["unknown", (world) => openTab(world, { autoPageViews: true })],
  [
    "denied from an earlier visit",
    (world) => {
      seeded(world, "denied");
      return openTab(world, { autoPageViews: true });
    },
  ],
  [
    "denied by an explicit deny()",
    (world) => {
      const tab = openTab(world, { autoPageViews: true });
      tab.tracker.consent.deny();
      return tab;
    },
  ],
  [
    "a record of an older consentVersion",
    (world) => {
      seeded(world, "granted");
      return openTab(world, { autoPageViews: true, consentVersion: 2 });
    },
  ],
  [
    "granted with Global Privacy Control",
    (world) => {
      seeded(world, "granted");
      return openTab(world, { autoPageViews: true, gpc: true });
    },
  ],
  [
    "granted with Do Not Track",
    (world) => {
      seeded(world, "granted");
      return openTab(world, { autoPageViews: true, dnt: "1" });
    },
  ],
  [
    "granted, then Global Privacy Control appears",
    (world) => {
      seeded(world, "granted");
      const tab = openTab(world);
      tab.page.setGpc(true);
      return tab;
    },
  ],
  [
    "granted, then Do Not Track appears",
    (world) => {
      seeded(world, "granted");
      const tab = openTab(world);
      tab.page.setDnt("1");
      return tab;
    },
  ],
  [
    "unknown with storage that throws on every call",
    (world) => {
      world.local.failAll(true);
      return openTab(world, { autoPageViews: true });
    },
  ],
];

const MINUTE = 60_000;

const ACTIONS: readonly (readonly [string, (tab: Tab) => unknown])[] = [
  [
    "track a declared event",
    (tab) => {
      tab.tracker.track("clicked", { target: "buy" });
    },
  ],
  [
    "track with every kind of property",
    (tab) => {
      tab.tracker.track("signup_completed", { plan: "pro", seats: 3, trial: true });
    },
  ],
  [
    "track an undeclared event",
    (tab) => {
      tab.tracker.track("nope");
    },
  ],
  [
    "track many events",
    (tab) => {
      for (let index = 0; index < 50; index += 1) tab.tracker.track("logout");
    },
  ],
  [
    "page()",
    (tab) => {
      tab.tracker.page();
    },
  ],
  [
    "page() with overrides",
    (tab) => {
      tab.tracker.page({ path: "/virtual?x=1", referrer: "https://a.example/p" });
    },
  ],
  [
    "identify an id",
    (tab) => {
      tab.tracker.identify("user_1");
    },
  ],
  [
    "identify null",
    (tab) => {
      tab.tracker.identify(null);
    },
  ],
  ["flush()", (tab) => tab.tracker.flush()],
  ["consent.get()", (tab) => tab.tracker.consent.get()],
  [
    "consent.onChange()",
    (tab) => {
      tab.tracker.consent.onChange(() => undefined)();
    },
  ],
  [
    "the page being hidden",
    (tab) => {
      tab.page.hide();
    },
  ],
  [
    "the page being hidden twice",
    (tab) => {
      tab.page.hide();
      tab.page.hide();
    },
  ],
  [
    "going offline and online",
    (tab) => {
      tab.page.goOffline();
      tab.page.goOnline();
    },
  ],
  [
    "navigating the history",
    (tab) => {
      tab.page.navigate("https://shop.example.com/cart?secret=1");
      tab.page.navigate("https://shop.example.com/", "pop");
    },
  ],
  [
    "a minute passing",
    (tab) => {
      tab.world.clock.advance(MINUTE);
    },
  ],
  [
    "a session timeout passing, then an event",
    (tab) => {
      tab.world.clock.advance(31 * MINUTE);
      tab.tracker.track("clicked", { target: "late" });
    },
  ],
  [
    "another tab announcing a consent change",
    (tab) => {
      const other = tab.world.hub.connect();
      other.post({ type: "consent-changed" });
    },
  ],
  [
    "dispose()",
    (tab) => {
      tab.tracker.dispose();
    },
  ],
];

describe("nothing is sent or stored without effective consent", () => {
  describe.each(SCENARIOS)("with consent %s", (_scenario, open) => {
    it.each(ACTIONS)("after %s", async (_action, act) => {
      const world = createWorld();
      const tab = open(world);
      const before = {
        local: world.local.calls.length,
        session: tab.session.calls.length,
      };
      await act(tab);
      await settle();
      world.clock.advance(10 * MINUTE);
      await settle();
      expect(world.collector.requests).toEqual([]);
      expect(changesSince(world.local, before.local)).toEqual([]);
      expect(changesSince(tab.session, before.session)).toEqual([]);
    });
  });

  it("writes the consent record alone when the visitor explicitly decides", () => {
    for (const [decide, key] of [
      [(tab: Tab) => tab.tracker.consent.deny(), "setItem"],
      [(tab: Tab) => tab.tracker.consent.reset(), "removeItem"],
    ] as const) {
      const world = createWorld();
      const tab = openTab(world, { autoPageViews: true });
      decide(tab);
      expect(changesSince(world.local, 0)).toEqual([`${key} ${CONSENT_KEY}`]);
      expect(changesSince(tab.session, 0)).toEqual([]);
    }
  });

  it.each([
    ["Global Privacy Control", { gpc: true }],
    ["Do Not Track", { dnt: "1" }],
  ])("writes nothing at all when a grant meets %s, and sends nothing", async (_label, signal) => {
    const world = createWorld();
    const tab = openTab(world, { autoPageViews: true, ...signal });
    tab.tracker.consent.grant();
    tab.tracker.track("clicked", { target: "x" });
    tab.tracker.page();
    await tab.tracker.flush();
    tab.page.hide();
    world.clock.advance(10 * MINUTE);
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(changesSince(world.local, 0)).toEqual([]);
    expect(changesSince(tab.session, 0)).toEqual([]);
  });

  it("is not vacuous: with consent granted the same calls send and store", async () => {
    const world = createWorld();
    const tab = grantedTab(world, { autoPageViews: true });
    tab.tracker.track("clicked", { target: "buy" });
    await tab.tracker.flush();
    expect(world.collector.requests.length).toBeGreaterThan(0);
    expect(tab.session.peek(SESSION_KEY)).not.toBeNull();
    expect(changesSince(world.local, 0)).toContain(`setItem ${QUEUE_KEY}`);
    expect(world.collector.violations).toEqual([]);
  });
});
