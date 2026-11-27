const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgePorts {
  readonly properties: () => Promise<readonly { id: number; retentionDays: number }[]>;
  /** Deletes the property's events that occurred before the instant; returns how many. */
  readonly deleteEventsBefore: (propertyId: number, before: Date) => Promise<number>;
  readonly now: () => number;
}

/** Deletes each property's events older than its retentionDays; returns how many in all. */
export const purgeExpiredEvents = async (ports: PurgePorts): Promise<number> => {
  const now = ports.now();
  let deleted = 0;
  for (const property of await ports.properties()) {
    deleted += await ports.deleteEventsBefore(
      property.id,
      new Date(now - property.retentionDays * DAY_MS),
    );
  }
  return deleted;
};
