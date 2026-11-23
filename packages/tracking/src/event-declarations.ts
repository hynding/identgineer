import {
  EVENT_NAME_PATTERN,
  MAX_PROPERTIES_PER_EVENT,
  PROPERTY_KEY_PATTERN,
} from "./wire-format.ts";

export type FieldType = "string" | "number" | "boolean";

/** What `track` accepts for one event: its property keys and the type of each. */
export interface EventDeclaration {
  readonly properties: Readonly<Record<string, FieldType>>;
}

export type DeclaredEvents = ReadonlyMap<string, ReadonlyMap<string, FieldType>>;

/** The name `page()` records under; it takes no properties and needs no declaration. */
export const PAGE_VIEW_EVENT = "page_view";

const FIELD_TYPES: readonly string[] = ["string", "number", "boolean"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fieldType = (event: string, key: string, type: unknown): FieldType => {
  if (typeof type === "string" && FIELD_TYPES.includes(type)) return type as FieldType;
  const shown = typeof type === "string" ? `"${type}"` : typeof type;
  throw new TypeError(
    `options.events: event "${event}" declares property "${key}" as ${shown}; use "string", "number" or "boolean"`,
  );
};

const declareProperties = (event: string, declaration: unknown): Map<string, FieldType> => {
  if (!isRecord(declaration) || !isRecord(declaration.properties)) {
    throw new TypeError(`options.events: event "${event}" needs a properties object`);
  }
  const keys = Object.keys(declaration.properties);
  if (keys.length > MAX_PROPERTIES_PER_EVENT) {
    throw new TypeError(
      `options.events: event "${event}" declares more than ${String(MAX_PROPERTIES_PER_EVENT)} properties`,
    );
  }
  const properties = new Map<string, FieldType>();
  for (const key of keys) {
    if (!PROPERTY_KEY_PATTERN.test(key)) {
      throw new TypeError(
        `options.events: event "${event}" declares "${key}", which is not a valid property key (${PROPERTY_KEY_PATTERN.source})`,
      );
    }
    properties.set(key, fieldType(event, key, declaration.properties[key]));
  }
  return properties;
};

/** Checks the `events` option and copies it, so what the page changes later changes nothing here. */
export const parseEventDeclarations = (events: unknown): DeclaredEvents => {
  if (!isRecord(events)) throw new TypeError("options.events must be an object of declarations");
  const declared = new Map<string, ReadonlyMap<string, FieldType>>();
  for (const name of Object.keys(events)) {
    if (!EVENT_NAME_PATTERN.test(name)) {
      throw new TypeError(
        `options.events: "${name}" is not a valid event name (${EVENT_NAME_PATTERN.source})`,
      );
    }
    if (name === PAGE_VIEW_EVENT) {
      throw new TypeError(
        `options.events: "${PAGE_VIEW_EVENT}" is the built-in page view; call page()`,
      );
    }
    declared.set(name, declareProperties(name, events[name]));
  }
  return declared;
};
