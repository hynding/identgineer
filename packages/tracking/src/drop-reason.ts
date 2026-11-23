export type DropCode =
  | "invalid-event-name"
  | "undeclared-event"
  | "undeclared-property"
  | "invalid-property"
  | "invalid-properties"
  | "invalid-identifier"
  | "invalid-url"
  | "event-too-large"
  | "queue-overflow"
  | "expired"
  | "rejected-by-server"
  | "no-random-source";

/**
 * Why something was dropped instead of sent. The message names the event, the property key or the
 * status, and never a value: values may be personal data and a report goes to the page's own code.
 */
export interface DropReason {
  readonly code: DropCode;
  readonly message: string;
}

export const dropReason = (code: DropCode, message: string): DropReason => ({ code, message });
