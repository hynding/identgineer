import { createHash } from "crypto";
import type { PropertyValue, WireEvent } from "./batch";

/** The event `page()` records: always accepted, never with properties of its own. */
export const PAGE_VIEW = "page_view";
/** How far an event's corrected time may lie in the past, and ahead of the server's clock. */
export const MAX_EVENT_AGE_MS = 25 * 60 * 60 * 1000;
export const MAX_EVENT_LEAD_MS = 5 * 60 * 1000;

// Event.referrerHost in camis.json: a host name with a top-level domain, never an address.
const HOST_PATTERN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** What a property lets its key send, as the handler reads it from the property's row. */
export interface IngestPolicy {
  /** Event name to the property keys it keeps; `page_view` need not be listed. */
  readonly allowedEvents: ReadonlyMap<string, ReadonlySet<string>>;
  readonly allowedQueryParams: ReadonlySet<string>;
}

/** One Event row, before the property and owner relations are added. */
export interface EventRow {
  readonly name: string;
  readonly dedupeKey: string;
  readonly occurredAt: Date;
  readonly sessionId: string | null;
  readonly path: string | null;
  readonly referrerHost: string | null;
  readonly properties: Readonly<Record<string, PropertyValue>> | null;
}

/** The SHA-256 of the property's id and the event's id, in hex: Event.dedupeKey. */
export const dedupeKeyOf = (propertyId: number, eventId: string): string =>
  createHash("sha256")
    .update(`${String(propertyId)}:${eventId}`)
    .digest("hex");

/**
 * The event's time on the server's clock (`at + (now - sentAt)`), or undefined when that lies
 * more than 25 hours back or more than 5 minutes ahead.
 */
export const occurredAtOf = (at: number, sentAt: number, now: number): Date | undefined => {
  const corrected = at + (now - sentAt);
  return corrected < now - MAX_EVENT_AGE_MS || corrected > now + MAX_EVENT_LEAD_MS
    ? undefined
    : new Date(corrected);
};

/**
 * The path with only the allowed query parameters, compared by their name as sent (allowed names
 * are characters the URL parser never encodes), in their order; the fragment is always dropped.
 */
export const pathOf = (path: string, allowed: ReadonlySet<string>): string => {
  const withoutFragment = path.split("#")[0] ?? "";
  const mark = withoutFragment.indexOf("?");
  if (mark === -1) return withoutFragment;
  const kept = withoutFragment
    .slice(mark + 1)
    .split("&")
    .filter((pair) => pair !== "" && allowed.has(pair.split("=")[0] ?? ""));
  const base = withoutFragment.slice(0, mark);
  return kept.length === 0 ? base : `${base}?${kept.join("&")}`;
};

/** The referring origin's host in lower case, or null for an address, a bare name or a port alone. */
export const referrerHostOf = (referrer: string): string | null => {
  const authority = referrer.replace(/^https?:\/\//, "");
  if (authority.startsWith("[")) return null;
  const host = authority.replace(/:[0-9]*$/, "").toLowerCase();
  return host.length <= 253 && HOST_PATTERN.test(host) ? host : null;
};

/**
 * The properties a property keeps for this event: none for a page view, only the listed keys for
 * a listed event (null when none is left); undefined when the event is not listed, so it is skipped.
 */
export const propertiesOf = (
  event: WireEvent,
  policy: IngestPolicy,
): Readonly<Record<string, PropertyValue>> | null | undefined => {
  if (event.name === PAGE_VIEW) return null;
  const keys = policy.allowedEvents.get(event.name);
  if (keys === undefined) return undefined;
  const kept = Object.entries(event.properties ?? {}).filter(([key]) => keys.has(key));
  return kept.length === 0 ? null : Object.fromEntries(kept);
};

/**
 * The row an accepted event becomes, or undefined when it is skipped (not allowed, or outside the
 * time window). The visitor's `user` id is never kept.
 */
export const eventRowOf = (
  event: WireEvent,
  context: { readonly propertyId: number; readonly sentAt: number; readonly now: number },
  policy: IngestPolicy,
): EventRow | undefined => {
  const occurredAt = occurredAtOf(event.at, context.sentAt, context.now);
  const properties = propertiesOf(event, policy);
  if (occurredAt === undefined || properties === undefined) return undefined;
  return {
    name: event.name,
    dedupeKey: dedupeKeyOf(context.propertyId, event.id),
    occurredAt,
    sessionId: event.session ?? null,
    path: event.path === undefined ? null : pathOf(event.path, policy.allowedQueryParams),
    referrerHost: event.referrer === undefined ? null : referrerHostOf(event.referrer),
    properties,
  };
};
