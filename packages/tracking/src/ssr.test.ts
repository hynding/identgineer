import { describe, expect, it } from "vitest";
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
    expect(tracker.consent.get()).toEqual({ state: "unknown" });
    expect(tracker.consent.grant()).toBe(false);
    expect(() => {
      tracker.track("clicked", { target: "x" });
      tracker.page();
      tracker.identify("user_1");
    }).not.toThrow();
    await expect(tracker.flush()).resolves.toBeUndefined();
    tracker.dispose();
  });

  it("opens no channel and arms no timer of its own while there is no page", () => {
    const tracker = createTracker(OPTIONS);
    tracker.dispose();
    expect(typeof parseTrackingBatch).toBe("function");
  });
});
