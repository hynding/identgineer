import { describe, expect, it } from "vitest";
import { createManualClock } from "./testing/manual-clock.ts";
import { createThrottle } from "./throttle.ts";

const throttledFor = (check: () => void): number | undefined => {
  try {
    check();
  } catch (error) {
    expect(error).toMatchObject({ code: "throttled" });
    return (error as { retryAfterSeconds?: number }).retryAfterSeconds;
  }
  return undefined;
};

describe("createThrottle", () => {
  it("lets attempts through until told otherwise", () => {
    const throttle = createThrottle(createManualClock());
    expect(throttledFor(throttle.check)).toBeUndefined();
    expect(throttle.remainingSeconds()).toBe(0);
  });

  it("refuses attempts for the server's wait and counts down", () => {
    const clock = createManualClock();
    const throttle = createThrottle(clock);
    throttle.serverThrottled(30);
    expect(throttledFor(throttle.check)).toBe(30);
    clock.advance(10_500);
    expect(throttle.remainingSeconds()).toBe(20);
    expect(throttledFor(throttle.check)).toBe(20);
    clock.advance(19_500);
    expect(throttledFor(throttle.check)).toBeUndefined();
  });

  it("backs off exponentially from the third failed sign-in", () => {
    const clock = createManualClock();
    const throttle = createThrottle(clock);
    throttle.signInFailed();
    throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(0);
    throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(2);
    clock.advance(2000);
    throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(4);
    clock.advance(4000);
    throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(8);
  });

  it("caps the backoff at five minutes", () => {
    const throttle = createThrottle(createManualClock());
    for (let attempt = 0; attempt < 30; attempt += 1) throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(300);
  });

  it("forgets failures after a successful sign-in", () => {
    const throttle = createThrottle(createManualClock());
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.signInFailed();
    throttle.signInSucceeded();
    expect(throttle.remainingSeconds()).toBe(0);
    throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(0);
  });

  it("keeps the longer of a backoff and a server wait", () => {
    const throttle = createThrottle(createManualClock());
    throttle.serverThrottled(60);
    for (let attempt = 0; attempt < 3; attempt += 1) throttle.signInFailed();
    expect(throttle.remainingSeconds()).toBe(60);
  });
});
