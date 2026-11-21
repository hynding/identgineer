import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "./countdown";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Countdown", () => {
  it("calls back once the duration has run", () => {
    const elapsed = vi.fn();
    const countdown = new Countdown(elapsed);
    countdown.start(1000);
    vi.advanceTimersByTime(999);
    expect(elapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("never calls back without a duration", () => {
    const elapsed = vi.fn();
    new Countdown(elapsed).start(undefined);
    vi.advanceTimersByTime(60_000);
    expect(elapsed).not.toHaveBeenCalled();
  });

  it("stands still while held and runs on with the time left once released", () => {
    const elapsed = vi.fn();
    const countdown = new Countdown(elapsed);
    countdown.start(1000);
    vi.advanceTimersByTime(600);
    countdown.hold("hover");
    vi.advanceTimersByTime(10_000);
    expect(elapsed).not.toHaveBeenCalled();
    countdown.release("hover");
    vi.advanceTimersByTime(399);
    expect(elapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("keeps standing still until every reason to hold it is released", () => {
    const elapsed = vi.fn();
    const countdown = new Countdown(elapsed);
    countdown.start(1000);
    countdown.hold("hover");
    countdown.hold("focus");
    countdown.release("hover");
    vi.advanceTimersByTime(5000);
    expect(elapsed).not.toHaveBeenCalled();
    countdown.release("focus");
    vi.advanceTimersByTime(1000);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("does not start while held, and starts in full when released", () => {
    const elapsed = vi.fn();
    const countdown = new Countdown(elapsed);
    countdown.hold("queued");
    countdown.start(1000);
    vi.advanceTimersByTime(5000);
    expect(elapsed).not.toHaveBeenCalled();
    countdown.release("queued");
    vi.advanceTimersByTime(1000);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by stop", () => {
    const elapsed = vi.fn();
    const countdown = new Countdown(elapsed);
    countdown.start(1000);
    countdown.stop();
    countdown.release("anything");
    vi.advanceTimersByTime(5000);
    expect(elapsed).not.toHaveBeenCalled();
  });
});
