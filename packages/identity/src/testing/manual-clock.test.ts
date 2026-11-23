import { describe, expect, it, vi } from "vitest";
import { createManualClock } from "./manual-clock.ts";

describe("createManualClock", () => {
  it("starts at the given time and advances on demand", () => {
    const clock = createManualClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
  });

  it("runs timers that come due, in order", () => {
    const clock = createManualClock(0);
    const calls: string[] = [];
    clock.setTimeout(() => calls.push("late"), 200);
    clock.setTimeout(() => calls.push("early"), 100);
    clock.advance(150);
    expect(calls).toEqual(["early"]);
    clock.advance(50);
    expect(calls).toEqual(["early", "late"]);
  });

  it("cancels a timer and counts pending ones", () => {
    const clock = createManualClock(0);
    const callback = vi.fn();
    const handle = clock.setTimeout(callback, 10);
    expect(clock.pendingTimers()).toBe(1);
    clock.clearTimeout(handle);
    clock.advance(20);
    expect(callback).not.toHaveBeenCalled();
    expect(clock.pendingTimers()).toBe(0);
  });

  it("runs a timer set by a timer when it also comes due", () => {
    const clock = createManualClock(0);
    const calls: number[] = [];
    clock.setTimeout(() => {
      calls.push(clock.now());
      clock.setTimeout(() => calls.push(clock.now()), 10);
    }, 10);
    clock.advance(30);
    expect(calls).toEqual([10, 20]);
  });
});
