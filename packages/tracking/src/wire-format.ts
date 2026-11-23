/** The wire format of a batch of tracking events. Nothing in this file touches the DOM. */

export const WIRE_VERSION = 1;

export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_PROPERTIES_PER_EVENT = 32;
/** What the wire format accepts; the client's own cap (`maxStringLength`) is lower by default. */
export const MAX_WIRE_STRING_LENGTH = 1024;
export const MAX_PATH_LENGTH = 2048;
/** The latest instant a `Date` can hold, which bounds every timestamp. */
export const MAX_TIMESTAMP = 8_640_000_000_000_000;

export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const PROPERTY_KEY_PATTERN = EVENT_NAME_PATTERN;
export const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** An event id or a session id: random bytes in base64url (22 characters from 128 bits). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const WRITE_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
/** Origin-relative and ASCII: the URL parser has percent-encoded anything else; no fragment. */
export const PATH_PATTERN = /^\/[!"$-~]*$/;
/** An origin and nothing else: scheme, host (punycode) and an optional port. */
export const REFERRER_PATTERN = /^https?:\/\/[A-Za-z0-9.:[\]-]{1,253}$/;

export type PropertyValue = string | number | boolean;

export interface TrackingEvent {
  /** Client-generated; the server de-duplicates on it. */
  readonly id: string;
  readonly name: string;
  /** Epoch milliseconds on the client's clock. */
  readonly at: number;
  readonly session: string;
  /** Only when the page called `identify` with an opaque id. */
  readonly user?: string;
  /** Origin-relative path, plus the query parameters the page allowed. */
  readonly path?: string;
  /** The referring origin, only on a page view and never when it is the page's own. */
  readonly referrer?: string;
  readonly properties?: Readonly<Record<string, PropertyValue>>;
}

export interface TrackingBatch {
  readonly v: typeof WIRE_VERSION;
  /** Epoch milliseconds on the client's clock at sending, so the server can correct skew. */
  readonly sentAt: number;
  /** Only in a beacon, which cannot set a header. */
  readonly writeKey?: string;
  readonly events: readonly TrackingEvent[];
}

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };
