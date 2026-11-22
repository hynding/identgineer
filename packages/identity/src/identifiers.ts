import { IdentityError } from "./identity-error.ts";

// Lowercase names as the backends list their providers. `local` is refused: the provider callback
// route treats it as a password sign-in.
const PROVIDER = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

const segment = (value: string, pattern: RegExp): string => {
  if (!pattern.test(value)) throw new IdentityError("validation");
  return encodeURIComponent(value);
};

/** A provider name checked against a strict pattern, ready for a URL path. */
export const providerSegment = (name: string): string => {
  if (name === "local") throw new IdentityError("validation");
  return segment(name, PROVIDER);
};

/** A session id checked against a strict pattern, ready for a URL path. */
export const sessionSegment = (id: string): string => segment(id, SESSION_ID);
