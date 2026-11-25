import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Debounce } from "./debounce";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Debounce", () => {
  it("runs once, the delay after the last of a burst of calls", () => {
    const run = vi.fn();
    const debounce = new Debounce(run, 250);
    for (let index = 0; index < 20; index += 1) {
      debounce.schedule();
      vi.advanceTimersByTime(100);
    }
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs at once on flush when a run is waiting, and not again when its timer would have fired", () => {
    const run = vi.fn();
    const debounce = new Debounce(run, 250);
    debounce.schedule();
    debounce.flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does nothing on flush when nothing is waiting", () => {
    const run = vi.fn();
    new Debounce(run, 250).flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("drops a waiting run on cancel", () => {
    const run = vi.fn();
    const debounce = new Debounce(run, 250);
    debounce.schedule();
    debounce.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    expect(debounce.pending).toBe(false);
  });

  it("says whether a run is waiting", () => {
    const debounce = new Debounce(() => undefined, 250);
    expect(debounce.pending).toBe(false);
    debounce.schedule();
    expect(debounce.pending).toBe(true);
    vi.advanceTimersByTime(250);
    expect(debounce.pending).toBe(false);
  });

  it("takes injected timers", () => {
    const pending: (() => void)[] = [];
    const run = vi.fn();
    const debounce = new Debounce(run, 250, {
      setTimeout: (callback) => pending.push(callback),
      clearTimeout: () => {
        pending.length = 0;
      },
    });
    debounce.schedule();
    debounce.schedule();
    expect(pending).toHaveLength(1);
    pending[0]?.();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
