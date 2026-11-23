/** The default of every optional setting; the README's option table is checked against it. */
export const TRACKER_DEFAULTS = {
  consentVersion: 1,
  autoPageViews: false,
  allowedQueryParameters: [] as readonly string[],
  /** UTF-16 units kept of a string property. */
  maxStringLength: 256,
  /** Events that trigger a flush by themselves, and at most per request. */
  maxBatchSize: 20,
  /** Milliseconds from the first waiting event to a flush. */
  flushInterval: 5000,
  /** UTF-8 bytes of a request body. */
  maxPayloadBytes: 32_768,
  maxQueueEvents: 200,
  maxQueueBytes: 102_400,
  /** Milliseconds without an event after which the session id rotates: 30 minutes. */
  sessionTimeout: 1_800_000,
} as const;
