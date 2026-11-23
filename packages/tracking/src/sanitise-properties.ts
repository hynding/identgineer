import { dropReason, type DropReason } from "./drop-reason.ts";
import type { FieldType } from "./event-declarations.ts";
import { truncateText } from "./truncate-text.ts";
import { toWellFormed } from "./well-formed.ts";
import type { PropertyValue } from "./wire-format.ts";

export interface SanitisedProperties {
  readonly properties: Record<string, PropertyValue>;
  readonly drops: readonly DropReason[];
}

const shownKey = (key: string): string => `"${key.slice(0, 64)}"`;

const valueOf = (
  value: unknown,
  type: FieldType,
  maxStringLength: number,
): PropertyValue | undefined => {
  if (type === "string" && typeof value === "string") {
    return truncateText(toWellFormed(value), maxStringLength);
  }
  if (type === "number" && typeof value === "number" && Number.isFinite(value)) return value;
  if (type === "boolean" && typeof value === "boolean") return value;
  return undefined;
};

const keysOf = (input: object): string[] | undefined => {
  try {
    return Object.keys(input);
  } catch {
    return undefined;
  }
};

/**
 * Keeps the properties an event declared, with the declared type, and drops the rest with a reason
 * that names the key. Strings are made well-formed and cut to the limit; numbers must be finite;
 * nothing nested survives. Only own keys are read, so no key can reach a prototype.
 */
export const sanitiseProperties = (
  declared: ReadonlyMap<string, FieldType>,
  input: unknown,
  maxStringLength: number,
): SanitisedProperties => {
  if (input === undefined) return { properties: {}, drops: [] };
  const keys =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? keysOf(input)
      : undefined;
  if (keys === undefined) {
    return {
      properties: {},
      drops: [dropReason("invalid-properties", "properties must be an object of declared keys")],
    };
  }
  const entries: [string, PropertyValue][] = [];
  const drops: DropReason[] = [];
  for (const key of keys) {
    const type = declared.get(key);
    if (type === undefined) {
      drops.push(dropReason("undeclared-property", `property ${shownKey(key)} is not declared`));
      continue;
    }
    let value: PropertyValue | undefined;
    try {
      value = valueOf((input as Record<string, unknown>)[key], type, maxStringLength);
    } catch {
      value = undefined;
    }
    if (value === undefined) {
      drops.push(
        dropReason(
          "invalid-property",
          `property ${shownKey(key)} must be a ${type}${type === "number" ? " that is finite" : ""}`,
        ),
      );
    } else entries.push([key, value]);
  }
  return { properties: Object.fromEntries(entries), drops };
};
