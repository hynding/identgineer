import { systemTimers, type CountdownClock } from "../identity/throttle-countdown";

/**
 * Runs `run` once, `delayMs` after the last of a burst of `schedule()` calls: for work too costly to
 * repeat on every keystroke. `flush()` runs a waiting call at once (before a submit reads the
 * result), and `cancel()` drops it (when the element leaves the page).
 */
export class Debounce {
  private timer: unknown;
  private waiting = false;

  constructor(
    private readonly run: () => void,
    private readonly delayMs: number,
    private readonly timers: CountdownClock = systemTimers,
  ) {}

  get pending(): boolean {
    return this.waiting;
  }

  schedule(): void {
    this.cancel();
    this.waiting = true;
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      this.waiting = false;
      this.run();
    }, this.delayMs);
  }

  flush(): void {
    if (!this.waiting) return;
    this.cancel();
    this.run();
  }

  cancel(): void {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = undefined;
    this.waiting = false;
  }
}
