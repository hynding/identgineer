import { describe, expect, it } from "vitest";
import { createAlarm } from "./alarm.ts";
import { START } from "./test-harness.ts";
import { createManualClock } from "./testing/manual-clock.ts";

describe("createAlarm", () => {
  it("runs the callback at the due time", () => {
    const clock = createManualClock(START);
    const alarm = createAlarm(clock);
    let fired = 0;
    alarm.set(START + 1000, () => {
      fired += 1;
    });
    clock.advance(999);
    expect(fired).toBe(0);
    clock.advance(1);
    expect(fired).toBe(1);
    expect(clock.pendingTimers()).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "arms nothing for the due time %s",
    (due) => {
      const clock = createManualClock(START);
      const alarm = createAlarm(clock);
      alarm.set(due, () => undefined);
      expect(clock.pendingTimers()).toBe(0);
    },
  );
});
