import { describe, expect, it, vi } from "vitest";
import { createTracker } from "./index.ts";
import { parseTrackingBatch } from "./wire.ts";

const OPTIONS = {
  endpoint: "https://collect.example.com/v1/events",
  writeKey: "wk_0123456789abcdef",
  events: { clicked: { properties: { target: "string" as const } } },
};

describe("server-side rendering", () => {
  it("runs where there is no window, no document and no storage", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const tracker = createTracker({ ...OPTIONS, autoPageViews: true });
    expect(tracker.consent.get()).toMatchObject({ state: "unknown" });
    expect(tracker.consent.grant()).toBe(false);
    expect(() => {
      tracker.track("clicked", { target: "x" });
      tracker.page();
      tracker.identify("user_1");
    }).not.toThrow();
    await expect(tracker.flush()).resolves.toBeUndefined();
    tracker.dispose();
  });

  it("opens no channel and arms no timer while there is no page", async () => {
    vi.useFakeTimers();
    const opened: unknown[] = [];
    vi.stubGlobal(
      "BroadcastChannel",
      vi.fn((name: unknown) => {
        opened.push(name);
      }),
    );
    try {
      const tracker = createTracker({ ...OPTIONS, autoPageViews: true });
      tracker.track("clicked", { target: "x" });
      await tracker.flush();
      expect(opened).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      tracker.dispose();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shares its wire format with a server, which needs no tracker to check a body", () => {
    expect(parseTrackingBatch({ v: 1, sentAt: 1, events: [] }).ok).toBe(false);
  });
});
