import { IdentityError } from "./identity-error.ts";

/** Larger answers than any identity endpoint gives are refused rather than parsed. */
export const MAX_BODY_CHARACTERS = 1_000_000;

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * A response body as plain JSON data, or undefined for an empty body. Over-long bodies, malformed
 * JSON and keys that could pollute a prototype when merged later are all refused.
 */
export const parseJson = (text: string): unknown => {
  if (text.length > MAX_BODY_CHARACTERS) throw new IdentityError("unknown");
  if (text === "") return undefined;
  try {
    return JSON.parse(text, (key, item: unknown) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error("forbidden key");
      return item;
    }) as unknown;
  } catch {
    throw new IdentityError("unknown");
  }
};
