import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const TOUCHED = [
  "fetch",
  "addEventListener",
  "removeEventListener",
  "BroadcastChannel",
  "localStorage",
  "sessionStorage",
  "document",
  "history",
  "location",
  "XMLHttpRequest",
  "WebSocket",
] as const;

describe("importing the package", () => {
  it("touches no global at all: no listener, timer, storage, network or channel", async () => {
    const touched: string[] = [];
    for (const name of TOUCHED) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => {
          touched.push(name);
          return undefined;
        },
      });
    }
    vi.useFakeTimers();
    try {
      vi.resetModules();
      await import("./index.ts");
      await import("./testing/index.ts");
      await import("./wire.ts");
      await import("./dashboard.ts");
    } finally {
      for (const name of TOUCHED) Reflect.deleteProperty(globalThis, name);
    }
    expect(touched).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("exports the documented surface and no more", async () => {
    const index = await import("./index.ts");
    expect(Object.keys(index).sort()).toEqual([
      "MAX_TRACKING_BATCH_BYTES",
      "TRACKER_DEFAULTS",
      "TRACKING_BATCH_JSON_SCHEMA",
      "WIRE_VERSION",
      "createTracker",
      "parseTrackingBatch",
      "parseTrackingBatchText",
      "parseTrackingEvent",
    ]);
    const dashboard = await import("./dashboard.ts");
    expect(Object.keys(dashboard).sort()).toEqual([
      "CmsDashboardError",
      "MAX_DASHBOARD_PAGE_SIZE",
      "MAX_DASHBOARD_PROPERTIES",
      "createCmsDashboardSource",
    ]);
    const testing = await import("./testing/index.ts");
    expect(Object.keys(testing).sort()).toEqual([
      "createCrossTabHub",
      "createFakeCollector",
      "createFakePage",
      "createManualClock",
      "createMemoryStorage",
      "createSeededRandom",
    ]);
  });

  // The dashboard source is for the signed-in owner's pages, not the tracked sites: the tracker's
  // entry point (and so its bundle) never reaches it.
  it("keeps the dashboard source out of the tracker's entry point", async () => {
    const { readFileSync } = await import("node:fs");
    const reached = new Set<string>();
    const visit = (file: string): void => {
      if (reached.has(file)) return;
      reached.add(file);
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      for (const match of source.matchAll(/from "\.\/([\w-]+\.ts)"/g)) visit(match[1] ?? "");
    };
    visit("index.ts");
    expect(reached.size).toBeGreaterThan(10);
    expect([...reached].filter((file) => file.includes("dashboard"))).toEqual([]);
  });

  it("keeps the wire format free of any browser API", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "wire-format.ts",
      "parse-tracking-batch.ts",
      "tracking-batch-schema.ts",
      "well-formed.ts",
      "code-point-length.ts",
      "utf8-length.ts",
      "wire.ts",
    ]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(
        /\b(window|document|navigator|localStorage|sessionStorage|globalThis|location)\b|\bfetch\(/,
      );
    }
  });
});
