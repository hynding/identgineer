/** Every key the SDK ever writes, each versioned so a later format never reads an older one's data. */
export const STORAGE_KEYS = {
  /** `localStorage`: the visitor's choice. The only key written before consent is granted. */
  consent: "idg.tracking.consent.v1",
  /** `localStorage`: events not yet delivered. Written only while consent is granted. */
  queue: "idg.tracking.queue.v1",
  /** `sessionStorage`: the session id and the time of its last event. Only while granted. */
  session: "idg.tracking.session.v1",
} as const;
