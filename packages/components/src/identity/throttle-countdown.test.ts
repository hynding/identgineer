import { describe, expect, it } from "vitest";
import { createManualClock } from "@identgineer/identity/testing";
import { formatWait, ThrottleCountdown } from "./throttle-countdown";

function setup(start: number) {
  const clock = createManualClock(0);
  const until = start * 1000;
  const seen: number[] = [];
  const countdown = new ThrottleCountdown((seconds) => seen.push(seconds));
  const read = () => Math.max(0, Math.ceil((until - clock.now()) / 1000));
  return { clock, seen, countdown, read };
}

describe("ThrottleCountdown", () => {
  it("reads the wait once a second from its source until it is over", () => {
    const { clock, seen, countdown, read } = setup(3);
    countdown.start(read, clock);
    expect(seen).toEqual([3]);
    clock.advance(1000);
    expect(seen).toEqual([3, 2]);
    clock.advance(2000);
    expect(seen).toEqual([3, 2, 1, 0]);
    clock.advance(5000);
    expect(seen).toEqual([3, 2, 1, 0]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("reports zero at once and keeps no timer when there is nothing to wait for", () => {
    const { clock, seen, countdown } = setup(0);
    countdown.start(() => 0, clock);
    expect(seen).toEqual([0]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("starts over on a new start, with one timer only", () => {
    const { clock, seen, countdown, read } = setup(5);
    countdown.start(read, clock);
    clock.advance(1000);
    countdown.start(read, clock);
    expect(seen).toEqual([5, 4, 4]);
    expect(clock.pendingTimers()).toBe(1);
  });

  it("stops without reporting again", () => {
    const { clock, seen, countdown, read } = setup(5);
    countdown.start(read, clock);
    countdown.stop();
    clock.advance(10_000);
    expect(seen).toEqual([5]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("treats a source that throws or answers nonsense as nothing to wait for", () => {
    const { clock, seen, countdown } = setup(0);
    countdown.start(() => {
      throw new Error("disposed");
    }, clock);
    countdown.start(() => Number.NaN, clock);
    expect(seen).toEqual([0, 0]);
  });
});

describe("formatWait", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [75, "1:15"],
    [300, "5:00"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
  ])("shows %i seconds as %s", (seconds, text) => {
    expect(formatWait(seconds)).toBe(text);
  });
});
