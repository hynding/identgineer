import { IDENTITY_ERROR_CODES, type IdentityErrorCode } from "./identity-types";

/** What a component takes from a rejection: never the message, which it does not show. */
export interface IdentityFailure {
  readonly code: IdentityErrorCode;
  /** The input fields the server refused (registration and profile input only). */
  readonly fields: readonly string[];
  /** Whole seconds until another attempt is accepted (`throttled` only). */
  readonly retryAfterSeconds?: number;
}

const isErrorCode = (value: unknown): value is IdentityErrorCode =>
  (IDENTITY_ERROR_CODES as readonly unknown[]).includes(value);

/**
 * Reads the SDK's `IdentityError` by its shape. Anything else is `unknown`: a component shows a
 * fixed message per code, so no text that came from a server or a library ever reaches the page.
 */
export function readIdentityError(error: unknown): IdentityFailure {
  const source = (typeof error === "object" && error !== null ? error : {}) as Record<
    string,
    unknown
  >;
  const code = isErrorCode(source.code) ? source.code : "unknown";
  const fields = Array.isArray(source.fields)
    ? source.fields.filter((field): field is string => typeof field === "string")
    : [];
  const wait = source.retryAfterSeconds;
  const retryAfterSeconds =
    typeof wait === "number" && Number.isFinite(wait) && wait >= 0 ? wait : undefined;
  return code === "unknown"
    ? { code, fields: [] }
    : { code, fields, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}
