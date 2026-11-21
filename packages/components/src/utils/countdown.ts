/**
 * A timer that can be held for several reasons at once (a pointer over it, focus inside it, the
 * window in the background) and runs on with the time it had left once every reason is released.
 */
export class Countdown {
  private readonly holds = new Set<string>();
  private remaining: number | undefined;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onElapsed: () => void) {}

  /** Starts again from `duration` milliseconds. Without one it never elapses. */
  start(duration: number | undefined): void {
    this.clear();
    this.remaining = duration;
    this.run();
  }

  hold(reason: string): void {
    if (this.holds.size === 0 && this.timer !== undefined && this.remaining !== undefined) {
      this.remaining -= Date.now() - this.startedAt;
    }
    this.holds.add(reason);
    this.clear();
  }

  release(reason: string): void {
    if (!this.holds.delete(reason)) return;
    this.run();
  }

  stop(): void {
    this.clear();
    this.remaining = undefined;
  }

  private run(): void {
    if (this.holds.size > 0 || this.remaining === undefined || this.timer !== undefined) return;
    this.startedAt = Date.now();
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.remaining = undefined;
        this.onElapsed();
      },
      Math.max(0, this.remaining),
    );
  }

  private clear(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
