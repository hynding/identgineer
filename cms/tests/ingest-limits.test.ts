import { describe, expect, it } from "vitest";
import { createKeyLimiter } from "../protected/src/ingest/key-limiter.ts";
import { readIngestSettings } from "../protected/src/ingest/settings.ts";

const clock = () => {
  let now = 1_000;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("the per-key limiter", () => {
  it("allows perMinute requests a key a minute, then refuses until the window turns", () => {
    const time = clock();
    const limiter = createKeyLimiter({ perMinute: 2, maxTracked: 10, now: time.now });
    expect(limiter.hit("a")).toEqual({ kind: "allowed" });
    expect(limiter.hit("a")).toEqual({ kind: "allowed" });
    time.advance(15_000);
    expect(limiter.hit("a")).toEqual({ kind: "limited", retryAfterSeconds: 45 });
    expect(limiter.hit("b")).toEqual({ kind: "allowed" });
    time.advance(45_000);
    expect(limiter.hit("a")).toEqual({ kind: "allowed" });
  });

  it("keeps windows on the minute it started, however long it was idle", () => {
    const time = clock();
    const limiter = createKeyLimiter({ perMinute: 1, maxTracked: 10, now: time.now });
    limiter.hit("a");
    time.advance(150_000);
    expect(limiter.hit("a")).toEqual({ kind: "allowed" });
    expect(limiter.hit("a")).toEqual({ kind: "limited", retryAfterSeconds: 30 });
  });

  it("counts keys beyond its cap together, so memory stays bounded and they cannot flood", () => {
    const time = clock();
    const limiter = createKeyLimiter({ perMinute: 2, maxTracked: 1, now: time.now });
    expect(limiter.hit("tracked").kind).toBe("allowed");
    expect(limiter.hit("x").kind).toBe("allowed");
    expect(limiter.hit("y").kind).toBe("allowed");
    expect(limiter.hit("z").kind).toBe("limited");
    expect(limiter.hit("tracked").kind).toBe("allowed");
  });
});

describe("readIngestSettings", () => {
  it("defaults to the wire format's body cap and 3000 requests a key a minute", () => {
    expect(readIngestSettings({})).toEqual({ maxBodyBytes: 65_536, keyRatePerMinute: 3000 });
  });

  it("reads whole numbers, floored at 1, and never raises the body cap past the wire's", () => {
    expect(
      readIngestSettings({ INGEST_MAX_BODY_BYTES: "1024", INGEST_KEY_RATE_PER_MINUTE: "0" }),
    ).toEqual({ maxBodyBytes: 1024, keyRatePerMinute: 1 });
    expect(readIngestSettings({ INGEST_MAX_BODY_BYTES: "1000000" }).maxBodyBytes).toBe(65_536);
  });

  it.each(["", "1e3", "-5", "12abc", " 12", "99999999999999999999"])(
    "keeps the defaults for %j",
    (value) => {
      expect(
        readIngestSettings({ INGEST_MAX_BODY_BYTES: value, INGEST_KEY_RATE_PER_MINUTE: value }),
      ).toEqual({ maxBodyBytes: 65_536, keyRatePerMinute: 3000 });
    },
  );
});
