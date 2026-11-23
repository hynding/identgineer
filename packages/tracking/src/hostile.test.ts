import { describe, expect, it } from "vitest";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  SESSION_KEY,
  consentRecord,
  createWorld,
  grantedTab,
  openTab,
  returningTab,
  settle,
} from "./test-harness.ts";
import { createTracker } from "./create-tracker.ts";
import { createMemoryStorage } from "./testing/memory-storage.ts";

const polluted = (): boolean => (({}) as { polluted?: unknown }).polluted !== undefined;

describe("hostile inputs", () => {
  describe("prototype pollution", () => {
    it("takes __proto__ and constructor as property names without effect", async () => {
      const tab = grantedTab(createWorld());
      const properties = JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"target":"x"}',
      ) as Record<string, unknown>;
      tab.tracker.track("clicked", properties);
      await tab.tracker.flush();
      expect(tab.world.collector.deliveredEvents()[0]?.properties).toEqual({ target: "x" });
      expect(tab.drops.map((drop) => drop.code)).toEqual([
        "undeclared-property",
        "undeclared-property",
      ]);
      expect(polluted()).toBe(false);
      expect(tab.world.collector.violations).toEqual([]);
    });

    it("keeps a declared constructor property an ordinary one", async () => {
      const world = createWorld();
      const tab = grantedTab(world, {
        events: { clicked: { properties: { constructor: "string" as const } } },
      });
      tab.tracker.track("clicked", { constructor: "x" });
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()[0]?.properties).toEqual({ constructor: "x" });
    });

    it("refuses to declare an event or a property called __proto__", () => {
      const world = createWorld();
      expect(() =>
        openTab(world, { events: JSON.parse('{"__proto__":{"properties":{}}}') as never }),
      ).toThrow(TypeError);
      expect(() =>
        openTab(world, {
          events: { a: { properties: JSON.parse('{"__proto__":"string"}') as never } },
        }),
      ).toThrow(TypeError);
      expect(polluted()).toBe(false);
    });

    it("reads hostile JSON from every storage key without effect", async () => {
      const world = createWorld();
      world.local.seed(
        CONSENT_KEY,
        '{"__proto__":{"polluted":true},"state":"granted","version":1,"decidedAt":1}',
      );
      world.local.seed(QUEUE_KEY, '{"__proto__":{"polluted":true},"v":1,"events":[]}');
      const session = createMemoryStorage();
      session.seed(
        SESSION_KEY,
        '{"__proto__":{"polluted":true},"id":"AAAAAAAAAAAAAAAAAAAAAA","last":1}',
      );
      const tab = openTab(world, { session });
      expect(tab.tracker.consent.get()).toMatchObject({ state: "unknown" });
      tab.tracker.consent.grant();
      tab.tracker.track("clicked", { target: "x" });
      await tab.tracker.flush();
      expect(polluted()).toBe(false);
      expect(world.collector.violations).toEqual([]);
    });
  });

  describe("huge and odd values", () => {
    it("cuts a million-character string and sends a valid, small batch", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("clicked", { target: "x".repeat(1_000_000) });
      await tab.tracker.flush();
      expect(tab.world.collector.requests[0]?.bytes).toBeLessThan(1024);
      expect(tab.world.collector.violations).toEqual([]);
    });

    it("never sends a lone surrogate, a NaN or an Infinity", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("signup_completed", { plan: "𐀀\ud800", seats: Infinity, trial: true });
      tab.tracker.track("signup_completed", { plan: "ok", seats: -Infinity, trial: false });
      tab.tracker.track("signup_completed", { plan: "ok", seats: Number.NaN, trial: false });
      await tab.tracker.flush();
      const body = tab.world.collector.requests.map((request) => request.body).join("");
      expect(body).not.toMatch(/\\ud800(?!\\udc00)/i);
      expect(tab.world.collector.violations).toEqual([]);
      expect(tab.world.collector.deliveredEvents().map((event) => event.properties)).toEqual([
        { plan: "𐀀�", trial: true },
        { plan: "ok", trial: false },
        { plan: "ok", trial: false },
      ]);
    });

    it("survives properties that are a throwing proxy or have a throwing getter", async () => {
      const tab = grantedTab(createWorld());
      const proxy = new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("hostile");
          },
        },
      );
      expect(() => {
        tab.tracker.track("clicked", proxy);
        tab.tracker.track("clicked", {
          get target(): string {
            throw new Error("hostile");
          },
        });
      }).not.toThrow();
      tab.tracker.track("logout");
      await tab.tracker.flush();
      expect(tab.world.collector.deliveredEvents().map((event) => event.name)).toEqual([
        "clicked",
        "clicked",
        "logout",
      ]);
    });

    it("survives overrides and identifiers that are objects with hostile members", () => {
      const tab = grantedTab(createWorld());
      const hostile = {
        get path(): string {
          throw new Error("hostile");
        },
      };
      expect(() => {
        tab.tracker.page(hostile);
        tab.tracker.page(null as never);
        tab.tracker.identify(hostile as never);
      }).not.toThrow();
    });
  });

  describe("storage that is hostile", () => {
    it("never throws, whichever call fails, from creation through every method", async () => {
      const world = createWorld();
      world.local.failAll(true);
      const session = createMemoryStorage();
      session.failAll(true);
      const tab = openTab(world, { session, autoPageViews: true });
      expect(() => {
        tab.tracker.consent.grant();
        tab.tracker.track("clicked", { target: "x" });
        tab.tracker.page();
        tab.tracker.identify("a");
        tab.tracker.consent.deny();
        tab.tracker.consent.reset();
        tab.page.hide();
      }).not.toThrow();
      await expect(tab.tracker.flush()).resolves.toBeUndefined();
      expect(world.collector.requests).toEqual([]);
    });

    it("never throws when the storage objects themselves are broken", async () => {
      const broken = {
        getItem: () => {
          throw new Error("x");
        },
        setItem: () => {
          throw new Error("x");
        },
        removeItem: () => {
          throw new Error("x");
        },
      };
      const world = createWorld();
      const tab = openTab(world, { localStorage: broken, sessionStorage: broken });
      expect(tab.tracker.consent.grant()).toBe(false);
      tab.tracker.track("clicked", { target: "x" });
      await tab.tracker.flush();
      expect(world.collector.requests).toEqual([]);
    });

    it("keeps working when the quota is hit while the queue is persisted", async () => {
      const world = createWorld();
      const tab = returningTab(world);
      world.local.failWrites(true);
      for (let index = 0; index < 30; index += 1)
        tab.tracker.track("clicked", { target: String(index) });
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()).toHaveLength(30);
      expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("granted"));
    });

    it("does not let a quota error on the consent record look like a decision", () => {
      const world = createWorld();
      world.local.failWrites(true);
      const tab = openTab(world);
      expect(tab.tracker.consent.grant()).toBe(false);
      expect(tab.tracker.consent.get()).toMatchObject({ state: "unknown" });
    });
  });

  describe("an environment that is missing or odd", () => {
    it("retries even when the random source for jitter answers garbage", async () => {
      const world = createWorld();
      const tab = grantedTab(world, { random: () => Number.NaN });
      world.collector.answer({ status: 500 });
      tab.tracker.track("clicked", { target: "x" });
      await tab.tracker.flush();
      world.clock.advance(1000);
      await settle();
      expect(world.collector.requests.length).toBeGreaterThanOrEqual(1);
    });

    it("throws at creation, and only then, for a wrong endpoint, key or declaration", () => {
      expect(() =>
        createTracker({ endpoint: "http://example.com", writeKey: "k".repeat(16), events: {} }),
      ).toThrow(TypeError);
    });
  });
});
