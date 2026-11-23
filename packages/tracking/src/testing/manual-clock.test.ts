import { describe, expect, it } from "vitest";
import { createManualClock } from "./manual-clock.ts";

describe("createManualClock", () => {
  it("starts where it is told and moves only when advanced", () => {
    const clock = createManualClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
  });

  it("runs the timers that come due, in order, at their own time", () => {
    const clock = createManualClock(0);
    const seen: [string, number][] = [];
    clock.setTimeout(() => seen.push(["late", clock.now()]), 200);
    clock.setTimeout(() => seen.push(["early", clock.now()]), 100);
    clock.advance(150);
    expect(seen).toEqual([["early", 100]]);
    clock.advance(100);
    expect(seen).toEqual([
      ["early", 100],
      ["late", 200],
    ]);
  });

  it("runs a timer that an earlier timer arms within the same advance", () => {
    const clock = createManualClock(0);
    let ran = false;
    clock.setTimeout(() => {
      clock.setTimeout(() => {
        ran = true;
      }, 10);
    }, 10);
    clock.advance(20);
    expect(ran).toBe(true);
  });

  it("does not run a cleared timer and counts the pending ones", () => {
    const clock = createManualClock(0);
    let ran = false;
    const handle = clock.setTimeout(() => {
      ran = true;
    }, 10);
    expect(clock.pendingTimers()).toBe(1);
    clock.clearTimeout(handle);
    clock.advance(100);
    expect(ran).toBe(false);
    expect(clock.pendingTimers()).toBe(0);
  });
});
