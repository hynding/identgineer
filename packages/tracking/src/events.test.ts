import { describe, expect, it } from "vitest";
import type { TrackingEvent } from "./wire-format.ts";
import {
  CONSENT_KEY,
  HOME,
  QUEUE_KEY,
  SESSION_KEY,
  START,
  createWorld,
  grantedTab,
  sessionIdsSent,
  settle,
  type Tab,
} from "./test-harness.ts";
import { TOKEN_PATTERN } from "./wire-format.ts";

const MINUTE = 60_000;

const sent = async (tab: Tab): Promise<TrackingEvent[]> => {
  await tab.tracker.flush();
  return tab.world.collector.deliveredEvents();
};

describe("track", () => {
  it("sends a declared event with an id, the time, the session and the minimised path", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("signup_completed", { plan: "pro", seats: 3, trial: false });
    const [event] = await sent(tab);
    expect(event).toMatchObject({
      name: "signup_completed",
      at: START,
      path: "/",
      properties: { plan: "pro", seats: 3, trial: false },
    });
    expect(event?.id).toMatch(TOKEN_PATTERN);
    expect(event?.session).toMatch(TOKEN_PATTERN);
    expect(event).not.toHaveProperty("user");
    expect(event).not.toHaveProperty("referrer");
  });

  it("omits an empty properties object", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("logout");
    expect((await sent(tab))[0]).not.toHaveProperty("properties");
  });

  it("gives every event its own id and a batch the time it was sent", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("logout");
    world.clock.advance(1000);
    tab.tracker.track("logout");
    world.clock.advance(1000);
    const events = await sent(tab);
    expect(events.map((event) => event.at)).toEqual([START, START + 1000]);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
    expect(world.collector.batches()[0]?.sentAt).toBe(START + 2000);
  });

  it("reduces the page's URL to a path and keeps only the allowed query parameters", async () => {
    const tab = grantedTab(createWorld(), {
      href: "https://shop.example.com/cart/items?utm_source=news&token=secret#pay",
      allowedQueryParameters: ["utm_source"],
    });
    tab.tracker.track("logout");
    expect((await sent(tab))[0]?.path).toBe("/cart/items?utm_source=news");
    expect(JSON.stringify(tab.world.collector.requests)).not.toContain("secret");
  });

  it("omits the path when the page has no web URL", async () => {
    const tab = grantedTab(createWorld(), { href: "file:///home/ada/index.html" });
    tab.tracker.track("logout");
    expect((await sent(tab))[0]).not.toHaveProperty("path");
  });

  it("records the location at the time of each event", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("logout");
    tab.page.navigate("https://shop.example.com/pricing?x=1");
    tab.tracker.track("logout");
    expect((await sent(tab)).map((event) => event.path)).toEqual(["/", "/pricing"]);
  });

  describe("what it drops", () => {
    it.each([
      ["an undeclared event", "unknown_event", "undeclared-event"],
      ["an upper-case name", "Clicked", "invalid-event-name"],
      ["a name with a dash", "sign-up", "invalid-event-name"],
      ["a name that is too long", `a${"b".repeat(64)}`, "invalid-event-name"],
      ["an empty name", "", "invalid-event-name"],
      ["__proto__", "__proto__", "invalid-event-name"],
      ["constructor, which is a valid name nobody declared", "constructor", "undeclared-event"],
      ["toString", "toString", "invalid-event-name"],
      ["page_view, which only page() records", "page_view", "undeclared-event"],
    ])("reports %s and never sends it", async (_label, name, code) => {
      const tab = grantedTab(createWorld());
      tab.tracker.track(name);
      expect(tab.drops.map((drop) => drop.code)).toEqual([code]);
      expect(await sent(tab)).toEqual([]);
    });

    it("drops a name that is not text without throwing", () => {
      const tab = grantedTab(createWorld());
      for (const name of [undefined, null, 5, {}, Symbol("x"), { toString: () => "clicked" }]) {
        expect(() => {
          tab.tracker.track(name as never);
        }).not.toThrow();
      }
      expect(tab.drops).toHaveLength(6);
    });

    it("sends the event without an undeclared property and reports the key, never the value", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("clicked", { target: "buy", email: "ada@example.com" });
      expect((await sent(tab))[0]?.properties).toEqual({ target: "buy" });
      expect(tab.drops).toHaveLength(1);
      expect(tab.drops[0]?.code).toBe("undeclared-property");
      expect(tab.drops[0]?.message).toContain("email");
      expect(JSON.stringify(tab.drops)).not.toContain("ada@example.com");
    });

    it("drops a property of the wrong type, a non-finite number and a nested value", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("signup_completed", { plan: 5, seats: Number.NaN, trial: { yes: true } });
      expect(tab.drops.map((drop) => drop.code)).toEqual([
        "invalid-property",
        "invalid-property",
        "invalid-property",
      ]);
      expect((await sent(tab))[0]).not.toHaveProperty("properties");
    });

    it("never lets a throwing onDrop break tracking", async () => {
      const tab = grantedTab(createWorld(), {
        onDrop: () => {
          throw new Error("reporter");
        },
      });
      expect(() => {
        tab.tracker.track("nope");
      }).not.toThrow();
      tab.tracker.track("logout");
      expect(await sent(tab)).toHaveLength(1);
    });
  });

  describe("strings", () => {
    it("are cut to maxStringLength, by default 256 units", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("clicked", { target: "x".repeat(10_000) });
      expect((await sent(tab))[0]?.properties).toEqual({ target: "x".repeat(256) });
    });

    it("are cut on a code point boundary", async () => {
      const tab = grantedTab(createWorld(), { maxStringLength: 4 });
      tab.tracker.track("clicked", { target: "abc\u{1f600}" });
      expect((await sent(tab))[0]?.properties).toEqual({ target: "abc" });
    });

    it("lose their lone surrogates", async () => {
      const tab = grantedTab(createWorld());
      tab.tracker.track("clicked", { target: "a\ud800b" });
      expect((await sent(tab))[0]?.properties).toEqual({ target: "a�b" });
    });
  });
});

describe("page", () => {
  it("records a page view with the path and no properties", async () => {
    const tab = grantedTab(createWorld(), { href: "https://shop.example.com/a/b?q=1#f" });
    tab.tracker.page();
    expect((await sent(tab))[0]).toMatchObject({ name: "page_view", path: "/a/b" });
    expect((await sent(tab))[0]).not.toHaveProperty("properties");
  });

  it("records the referrer's origin on the page view that began the visit, and only that one", async () => {
    const tab = grantedTab(createWorld(), {
      referrer: "https://www.google.com/search?q=private+matter#top",
    });
    tab.tracker.page();
    tab.tracker.page();
    const events = await sent(tab);
    expect(events[0]?.referrer).toBe("https://www.google.com");
    expect(events[1]).not.toHaveProperty("referrer");
    expect(JSON.stringify(tab.world.collector.requests)).not.toContain("private");
  });

  it("drops a referrer from the same origin", async () => {
    const tab = grantedTab(createWorld(), { referrer: "https://shop.example.com/other?x=1" });
    tab.tracker.page();
    expect((await sent(tab))[0]).not.toHaveProperty("referrer");
  });

  it("takes a path override and reduces it like any URL", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.page({
      path: "/virtual/step-2?token=secret#x",
      referrer: "https://news.example.org/a?b",
    });
    const [event] = await sent(tab);
    expect(event).toMatchObject({ path: "/virtual/step-2", referrer: "https://news.example.org" });
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "", 5, null])(
    "reports an override of %j and records the current page instead",
    async (path) => {
      const tab = grantedTab(createWorld());
      tab.tracker.page({ path } as never);
      expect((await sent(tab))[0]?.path).toBe("/");
      expect(tab.drops.map((drop) => drop.code)).toEqual(["invalid-url"]);
    },
  );
});

describe("identify", () => {
  it("attaches an opaque id to the events after it, and null clears it", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("logout");
    tab.tracker.identify("user_42-A");
    tab.tracker.track("logout");
    tab.tracker.identify(null);
    tab.tracker.track("logout");
    expect((await sent(tab)).map((event) => event.user)).toEqual([
      undefined,
      "user_42-A",
      undefined,
    ]);
  });

  it.each([
    ["an email", "ada@example.com"],
    ["a name", "Ada Lovelace"],
    ["an id with an at sign", "u@1"],
    ["an empty id", ""],
    ["an id over 64 characters", "u".repeat(65)],
    ["a number", 42],
    ["undefined", undefined],
    ["an object", { id: "x" }],
  ])("refuses %s, reports it and keeps the previous id", async (_label, value) => {
    const tab = grantedTab(createWorld());
    tab.tracker.identify("good_id");
    tab.tracker.identify(value as never);
    tab.tracker.track("logout");
    expect((await sent(tab))[0]?.user).toBe("good_id");
    expect(tab.drops.map((drop) => drop.code)).toEqual(["invalid-identifier"]);
    expect(JSON.stringify(tab.drops)).not.toContain("ada@example.com");
  });

  it("accepts 1 and 64 characters", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.identify("u".repeat(64));
    tab.tracker.track("logout");
    tab.tracker.identify("u");
    tab.tracker.track("logout");
    expect((await sent(tab)).map((event) => event.user?.length)).toEqual([64, 1]);
    expect(tab.drops).toEqual([]);
  });

  it("is remembered in memory only", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.identify("user_1");
    tab.tracker.track("logout");
    expect(JSON.stringify([...world.local.keys(), tab.session.peek(SESSION_KEY)])).not.toContain(
      "user_1",
    );
    expect(world.local.peek(QUEUE_KEY)).toContain("user_1");
    await tab.tracker.flush();
    expect(world.local.peek(CONSENT_KEY)).not.toContain("user_1");
  });
});

describe("sessions", () => {
  it("keeps one random id while events keep coming and keeps it in sessionStorage only", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("logout");
    world.clock.advance(5000);
    await settle();
    world.clock.advance(29 * MINUTE - 5000);
    tab.tracker.track("logout");
    world.clock.advance(5000);
    await settle();
    world.clock.advance(29 * MINUTE - 5000);
    tab.tracker.track("logout");
    await tab.tracker.flush();
    expect(sessionIdsSent(world)).toHaveLength(1);
    const stored = JSON.parse(tab.session.peek(SESSION_KEY) ?? "null") as { id: string };
    expect(stored.id).toBe(sessionIdsSent(world)[0]);
    expect(world.local.keys().some((key) => key === SESSION_KEY)).toBe(false);
  });

  it("rotates after 30 minutes of inactivity, and not a moment before", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    // Each jump lets the request that falls inside it be answered before the next one starts.
    const wait = async (ms: number): Promise<void> => {
      world.clock.advance(5000);
      await settle();
      world.clock.advance(ms - 5000);
    };
    tab.tracker.track("logout");
    await wait(30 * MINUTE);
    tab.tracker.track("logout");
    await wait(30 * MINUTE + 1);
    tab.tracker.track("logout");
    const events = await sent(tab);
    expect(events[0]?.session).toBe(events[1]?.session);
    expect(events[2]?.session).not.toBe(events[1]?.session);
  });

  it("takes its timeout from sessionTimeout", async () => {
    const world = createWorld();
    const tab = grantedTab(world, { sessionTimeout: 5000 });
    tab.tracker.track("logout");
    world.clock.advance(5001);
    tab.tracker.track("logout");
    expect(new Set((await sent(tab)).map((event) => event.session)).size).toBe(2);
  });

  it("carries on in the same tab after a reload", async () => {
    const world = createWorld();
    const first = grantedTab(world);
    first.tracker.track("logout");
    first.tracker.dispose();
    world.clock.advance(MINUTE);
    const second = grantedTab(world, { session: first.session });
    second.tracker.track("logout");
    await second.tracker.flush();
    expect(sessionIdsSent(world)).toHaveLength(1);
  });

  it("starts afresh when what is stored is not a session", async () => {
    const world = createWorld();
    const session = grantedTab(world).session;
    for (const stored of [
      "{",
      '{"id":"short","last":1}',
      '{"id":"AAAAAAAAAAAAAAAAAAAAAA"}',
      '{"__proto__":{"x":1}}',
    ]) {
      session.seed(SESSION_KEY, stored);
      const tab = grantedTab(world, { session });
      tab.tracker.track("logout");
      await tab.tracker.flush();
    }
    for (const id of sessionIdsSent(world)) expect(id).toMatch(TOKEN_PATTERN);
  });

  it("has no cross-session visitor id: two tabs get two sessions and nothing links them", async () => {
    const world = createWorld();
    const a = grantedTab(world);
    const b = grantedTab(world);
    a.tracker.track("logout");
    b.tracker.track("logout");
    await a.tracker.flush();
    await b.tracker.flush();
    expect(sessionIdsSent(world)).toHaveLength(2);
    expect(Object.keys(world.collector.deliveredEvents()[0] ?? {}).sort()).toEqual([
      "at",
      "id",
      "name",
      "path",
      "session",
    ]);
  });

  it("is not created without a source of randomness, and says so", async () => {
    const tab = grantedTab(createWorld(), { crypto: null });
    tab.tracker.track("logout");
    expect(tab.drops.map((drop) => drop.code)).toEqual(["no-random-source"]);
    expect(await sent(tab)).toEqual([]);
  });

  it("survives a session storage that fails", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.session.failAll(true);
    tab.tracker.track("logout");
    tab.tracker.track("logout");
    expect(new Set((await sent(tab)).map((event) => event.session)).size).toBe(1);
  });
});

describe("automatic page views", () => {
  it("are off unless asked for", async () => {
    const tab = grantedTab(createWorld());
    tab.page.navigate("https://shop.example.com/cart");
    expect(await sent(tab)).toEqual([]);
    expect(tab.page.listenerCount()).toBe(2);
  });

  it("record the page the visitor is on, then each navigation", async () => {
    const world = createWorld();
    world.local.seed(
      CONSENT_KEY,
      JSON.stringify({ state: "granted", version: 1, decidedAt: START }),
    );
    const tab = grantedTab(world, { autoPageViews: true });
    tab.page.navigate("https://shop.example.com/cart?secret=1");
    tab.page.navigate("https://shop.example.com/checkout", "replace");
    tab.page.navigate(HOME, "pop");
    const events = await sent(tab);
    expect(events.map((event) => [event.name, event.path])).toEqual([
      ["page_view", "/"],
      ["page_view", "/cart"],
      ["page_view", "/checkout"],
      ["page_view", "/"],
    ]);
  });

  it("record the page when consent is granted after load", async () => {
    const world = createWorld();
    const tab = grantedTab(world, {
      autoPageViews: true,
      href: "https://shop.example.com/landing",
    });
    expect((await sent(tab)).map((event) => event.path)).toEqual(["/landing"]);
  });

  it("skip a navigation that changes nothing a page view records", async () => {
    const tab = grantedTab(createWorld(), {
      autoPageViews: true,
      allowedQueryParameters: ["page"],
    });
    tab.page.navigate("https://shop.example.com/?secret=1");
    tab.page.navigate("https://shop.example.com/#section");
    tab.page.navigate("https://shop.example.com/?page=2");
    expect((await sent(tab)).map((event) => event.path)).toEqual(["/", "/?page=2"]);
  });

  it("stop at dispose", async () => {
    const tab = grantedTab(createWorld(), { autoPageViews: true });
    expect(tab.page.listenerCount()).toBe(3);
    tab.tracker.dispose();
    expect(tab.page.listenerCount()).toBe(0);
    tab.page.navigate("https://shop.example.com/after");
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
  });
});
