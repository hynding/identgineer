const DAY_MS = 24 * 60 * 60 * 1000;

export interface PurgePorts {
  readonly properties: () => Promise<readonly { id: number; retentionDays: number }[]>;
  /** Deletes the property's events that occurred before the instant; returns how many. */
  readonly deleteEventsBefore: (propertyId: number, before: Date) => Promise<number>;
  readonly now: () => number;
}

/**
 * Deletes each property's events older than its retentionDays; returns how many in all. A property
 * whose retentionDays is below 1 or not a whole number (the model allows 1 to 400, so only a row
 * written past it) keeps every event: an unreadable setting never deletes, as on strapi-php.
 */
export const purgeExpiredEvents = async (ports: PurgePorts): Promise<number> => {
  const now = ports.now();
  let deleted = 0;
  for (const property of await ports.properties()) {
    if (!Number.isInteger(property.retentionDays) || property.retentionDays < 1) continue;
    deleted += await ports.deleteEventsBefore(
      property.id,
      new Date(now - property.retentionDays * DAY_MS),
    );
  }
  return deleted;
};
