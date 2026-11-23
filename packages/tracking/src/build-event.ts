import { dropReason, type DropReason } from "./drop-reason.ts";
import { PAGE_VIEW_EVENT } from "./event-declarations.ts";
import { minimisePath, minimiseReferrer } from "./minimise-url.ts";
import { randomToken } from "./random-token.ts";
import type { ResolvedOptions } from "./resolve-options.ts";
import { sanitiseProperties } from "./sanitise-properties.ts";
import { EVENT_NAME_PATTERN, type PropertyValue, type TrackingEvent } from "./wire-format.ts";

export interface BuildResult {
  readonly event?: TrackingEvent;
  readonly drops: readonly DropReason[];
}

export interface EventSource {
  readonly options: ResolvedOptions;
  /** Extends or starts the session; called only once an event is otherwise valid. */
  readonly session: () => string | undefined;
  readonly user: () => string | undefined;
}

const read = <T>(get: () => T): T | undefined => {
  try {
    return get();
  } catch {
    return undefined;
  }
};

const currentPath = (source: EventSource): string | undefined => {
  const href = read(() => source.options.page.location());
  return href === undefined
    ? undefined
    : minimisePath(href, undefined, {
        allowedQueryParameters: source.options.allowedQueryParameters,
        maxValueLength: source.options.maxStringLength,
      });
};

interface Assembly {
  readonly name: string;
  readonly properties: Readonly<Record<string, PropertyValue>>;
  readonly path: string | undefined;
  readonly referrer: string | undefined;
}

const assemble = (source: EventSource, parts: Assembly, drops: DropReason[]): BuildResult => {
  const session = source.session();
  const id = randomToken(source.options.crypto);
  if (session === undefined || id === undefined) {
    return {
      drops: [
        ...drops,
        dropReason("no-random-source", "no source of randomness: the event cannot be given an id"),
      ],
    };
  }
  const user = source.user();
  const event: TrackingEvent = {
    id,
    name: parts.name,
    at: source.options.clock.now(),
    session,
    ...(user === undefined ? {} : { user }),
    ...(parts.path === undefined ? {} : { path: parts.path }),
    ...(parts.referrer === undefined ? {} : { referrer: parts.referrer }),
    ...(Object.keys(parts.properties).length === 0 ? {} : { properties: parts.properties }),
  };
  return { event, drops };
};

/** An event the page declared, with the properties it declared, as it would be sent. */
export const buildCustomEvent = (
  source: EventSource,
  name: unknown,
  properties: unknown,
): BuildResult => {
  if (typeof name !== "string" || !EVENT_NAME_PATTERN.test(name)) {
    return {
      drops: [
        dropReason("invalid-event-name", `event names must match ${EVENT_NAME_PATTERN.source}`),
      ],
    };
  }
  const declared = source.options.declared.get(name);
  if (declared === undefined) {
    return {
      drops: [dropReason("undeclared-event", `event "${name}" is not declared in options.events`)],
    };
  }
  const sanitised = sanitiseProperties(declared, properties, source.options.maxStringLength);
  const drops = sanitised.drops.map((drop) =>
    dropReason(drop.code, `event "${name}": ${drop.message}`),
  );
  return assemble(
    source,
    { name, properties: sanitised.properties, path: currentPath(source), referrer: undefined },
    drops,
  );
};

const invalidUrl = (what: string): DropReason =>
  dropReason(
    "invalid-url",
    `page(): ${what} is not a web URL or path; the current page is recorded`,
  );

/**
 * A page view. An override is reduced like any URL; one that cannot be is reported and replaced by
 * the current page. The document's referrer is recorded on the first view only, as its origin.
 */
export const buildPageView = (
  source: EventSource,
  overrides: unknown,
  withDocumentReferrer: boolean,
): BuildResult => {
  const drops: DropReason[] = [];
  const bag: { path?: unknown; referrer?: unknown } =
    typeof overrides === "object" && overrides !== null ? overrides : {};
  if (overrides !== undefined && bag !== overrides) drops.push(invalidUrl("the argument"));
  const href = read(() => source.options.page.location());
  const pathOptions = {
    allowedQueryParameters: source.options.allowedQueryParameters,
    maxValueLength: source.options.maxStringLength,
  };

  const pathOverride = read(() => bag.path);
  let path = currentPath(source);
  if (pathOverride !== undefined) {
    const reduced =
      typeof pathOverride === "string" ? minimisePath(pathOverride, href, pathOptions) : undefined;
    if (reduced === undefined) drops.push(invalidUrl("the path"));
    else path = reduced;
  }

  const referrerOverride = read(() => bag.referrer);
  let referrer: string | undefined;
  if (referrerOverride !== undefined) {
    if (typeof referrerOverride === "string") referrer = minimiseReferrer(referrerOverride, href);
    else drops.push(invalidUrl("the referrer"));
  } else if (withDocumentReferrer) {
    referrer = minimiseReferrer(read(() => source.options.page.referrer()) ?? "", href);
  }
  return assemble(source, { name: PAGE_VIEW_EVENT, properties: {}, path, referrer }, drops);
};
