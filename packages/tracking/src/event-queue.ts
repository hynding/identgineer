import type { TrackingEvent } from "./wire-format.ts";

export interface QueueEntry {
  readonly event: TrackingEvent;
  /** The event's size as JSON, in UTF-8 bytes. */
  readonly bytes: number;
}

export interface QueueLimits {
  readonly maxEvents: number;
  readonly maxBytes: number;
}

export interface EventQueue {
  /** Adds at the end; returns how many events were dropped to hold the limits. */
  readonly push: (entry: QueueEntry) => number;
  /** Adds older events in front; returns how many were dropped to hold the limits. */
  readonly prepend: (entries: readonly QueueEntry[]) => number;
  readonly entries: () => readonly QueueEntry[];
  readonly remove: (ids: ReadonlySet<string>) => void;
  readonly clear: () => void;
  readonly size: () => number;
  readonly bytes: () => number;
}

/** Events waiting for delivery, bounded by count and by bytes: the oldest go first. */
export const createEventQueue = (limits: QueueLimits): EventQueue => {
  let held: QueueEntry[] = [];
  let total = 0;

  // One pass from the oldest end, so a long over-full queue is trimmed once, not once per event.
  const enforce = (): number => {
    let dropped = 0;
    let bytes = total;
    while (
      dropped < held.length &&
      (held.length - dropped > limits.maxEvents || bytes > limits.maxBytes)
    ) {
      bytes -= held[dropped]?.bytes ?? 0;
      dropped += 1;
    }
    if (dropped > 0) held = held.slice(dropped);
    total = bytes;
    return dropped;
  };

  return {
    push: (entry) => {
      if (entry.bytes > limits.maxBytes) return 1;
      held.push(entry);
      total += entry.bytes;
      return enforce();
    },
    prepend: (entries) => {
      const fitting = entries.filter((entry) => entry.bytes <= limits.maxBytes);
      held = [...fitting, ...held];
      total = held.reduce((sum, entry) => sum + entry.bytes, 0);
      return entries.length - fitting.length + enforce();
    },
    entries: () => [...held],
    remove: (ids) => {
      held = held.filter((entry) => !ids.has(entry.event.id));
      total = held.reduce((sum, entry) => sum + entry.bytes, 0);
    },
    clear: () => {
      held = [];
      total = 0;
    },
    size: () => held.length,
    bytes: () => total,
  };
};
