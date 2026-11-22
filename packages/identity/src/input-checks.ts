import { IdentityError } from "./identity-error.ts";

// users-permissions hashes with bcrypt, which reads at most 72 bytes; it refuses longer passwords.
const MAX_PASSWORD_BYTES = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every check takes `unknown`: a JavaScript caller can pass anything, and a wrong type is a
// validation error like any other, never a TypeError.
export const isEmail = (value: unknown): boolean => typeof value === "string" && EMAIL.test(value);

export const isPassword = (value: unknown): boolean =>
  typeof value === "string" &&
  value !== "" &&
  new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES;

export const isFilled = (value: unknown): boolean =>
  typeof value === "string" && value.trim() !== "";

export const isText = (value: unknown): boolean => typeof value === "string";

/** Left out, or of the given type. */
export const isOptional = (value: unknown, type: "string" | "boolean"): boolean =>
  value === undefined || typeof value === type;

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
