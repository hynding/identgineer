import { IdentityError } from "./identity-error.ts";

// users-permissions hashes with bcrypt, which reads at most 72 bytes; it refuses longer passwords.
const MAX_PASSWORD_BYTES = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: string): boolean => EMAIL.test(value);

export const isPassword = (value: string): boolean =>
  value !== "" && new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES;

export const isFilled = (value: string): boolean => value.trim() !== "";

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
