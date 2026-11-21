export interface ToastQueueState<T> {
  visible: T[];
  queued: T[];
  /** The visible items that were not visible at the previous sync, so are announced now. */
  added: T[];
}

/**
 * Splits notifications into the oldest few that are shown and the rest that wait, so a burst of
 * them never covers the page, and tells which ones have just come into view.
 */
export class ToastQueue<T> {
  private shown = new Set<T>();

  sync(items: readonly T[], max: number): ToastQueueState<T> {
    const limit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 1;
    const visible = items.slice(0, limit);
    const added = visible.filter((item) => !this.shown.has(item));
    this.shown = new Set(visible);
    return { visible, queued: items.slice(limit), added };
  }
}
