import type { Clock } from "./clock.ts";

// setTimeout keeps delays in a signed 32-bit integer; a longer one fires at once. Long waits
// are armed a day at a time instead.
const MAX_CHUNK_MS = 86_400_000;

export interface Alarm {
  /** Runs `callback` at the clock time `due` (replacing any alarm already set). */
  readonly set: (due: number, callback: () => void) => void;
  readonly clear: () => void;
}

export const createAlarm = (clock: Clock): Alarm => {
  let timer: unknown;
  const clear = (): void => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  };
  const set = (due: number, callback: () => void): void => {
    clear();
    // A NaN or infinite due time would fire at once and re-arm forever; there is nothing to wait for.
    if (!Number.isFinite(due)) return;
    const wait = due - clock.now();
    timer = clock.setTimeout(
      () => {
        timer = undefined;
        if (clock.now() >= due) callback();
        else set(due, callback);
      },
      Math.min(Math.max(0, wait), MAX_CHUNK_MS),
    );
  };
  return { set, clear };
};
