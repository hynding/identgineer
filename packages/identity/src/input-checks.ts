import { IdentityError } from "./identity-error.ts";

// users-permissions hashes with bcrypt, which reads at most 72 bytes; it refuses longer passwords.
const MAX_PASSWORD_BYTES = 72;
/** camis' limit on an identifier, a username and an email address, in characters. */
export const MAX_NAME_CHARACTERS = 255;
/**
 * A code or token from an email: camis issues 128 hex characters for a reset, 40 for a
 * confirmation. The limit leaves room for other backends without sending anything unbounded.
 */
export const MAX_CODE_CHARACTERS = 512;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const WHITESPACE = /\s/;

const wellFormed = (value: string): boolean => {
  const native = (value as { isWellFormed?: () => boolean }).isWellFormed;
  return typeof native === "function" ? native.call(value) : !LONE_SURROGATE.test(value);
};

// Every check takes `unknown`: a JavaScript caller can pass anything, and a wrong type is a
// validation error like any other, never a TypeError.

/**
 * A string with no lone surrogate: one would be sent as `\ud800` in JSON, which the backend's
 * decoder may refuse, and makes `encodeURIComponent` throw.
 */
export const isText = (value: unknown): value is string =>
  typeof value === "string" && wellFormed(value);

/** Text of at most `max` characters (code points, as camis counts them). */
export const isTextWithin = (value: unknown, max: number): value is string =>
  isText(value) &&
  // Each character is one or two code units: no need to count past twice the limit.
  (value.length <= max || (value.length <= 2 * max && Array.from(value).length <= max));

export const isFilled = (value: unknown): value is string => isText(value) && value.trim() !== "";

/**
 * One `@`, something before it, and a dot inside the part after it, with no whitespace: checked
 * by scanning (linear in the length), and only up to camis' limit.
 */
export const isEmail = (value: unknown): value is string => {
  if (!isTextWithin(value, MAX_NAME_CHARACTERS) || WHITESPACE.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  return value
    .slice(at + 1)
    .slice(1, -1)
    .includes(".");
};

export const isPassword = (value: unknown): value is string =>
  isText(value) && value !== "" && new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES;

/** Left out, or a boolean (`null` is not left out). */
export const isOptionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === "boolean";

/** Left out, or text of at most `max` characters (`null` is not left out). */
export const isOptionalTextWithin = (value: unknown, max: number): boolean =>
  value === undefined || isTextWithin(value, max);

/** Refuses an input that is not an object (`null`, a string, a number) before a field is read. */
export const requireObject = (input: unknown): void => {
  if (typeof input !== "object" || input === null) throw new IdentityError("validation");
};

/** Throws a validation error naming the failed fields (when they may be named) if any failed. */
export const requireValid = (
  checks: Readonly<Record<string, boolean>>,
  options: { readonly nameFields: boolean },
): void => {
  const fields = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([field]) => field);
  if (fields.length === 0) return;
  throw new IdentityError("validation", options.nameFields ? { fields } : {});
};
