import { WIRE_VERSION, type TrackingEvent } from "./wire-format.ts";

/** The request body, with a stable key order. The key is only given for a beacon, which has no headers. */
export const serialiseBatch = (
  events: readonly TrackingEvent[],
  sentAt: number,
  writeKey?: string,
): string =>
  JSON.stringify({
    v: WIRE_VERSION,
    sentAt,
    ...(writeKey === undefined ? {} : { writeKey }),
    events,
  });
