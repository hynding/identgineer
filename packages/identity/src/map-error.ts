import { IdentityError } from "./identity-error.ts";
import { parseRetryAfter } from "./retry-after.ts";
import { readErrorEnvelope } from "./shapes.ts";
import type { ApiResponse } from "./transport.ts";

export const THROTTLED_STATUS = 429;

export const errorName = (response: ApiResponse): string | undefined =>
  readErrorEnvelope(response.body)?.name;

/** Whether the answer is a validation failure that names input fields. */
export const fieldsOf = (response: ApiResponse): readonly string[] =>
  readErrorEnvelope(response.body)?.fields ?? [];

export const throttledError = (response: ApiResponse, now: number): IdentityError =>
  new IdentityError("throttled", { retryAfterSeconds: parseRetryAfter(response.retryAfter, now) });

/**
 * The generic reading of a failed answer. `fields` lists the input fields a validation error may
 * name back to the caller; a field outside it, or any server text, is never passed on.
 */
export const failureOf = (
  response: ApiResponse,
  now: number,
  fields: readonly string[] = [],
): IdentityError => {
  if (response.status === THROTTLED_STATUS) return throttledError(response, now);
  if (response.status === 401 || response.status === 403) return new IdentityError("unauthorized");
  if (response.status === 400 && errorName(response) === "ValidationError") {
    const named = fieldsOf(response).filter((field) => fields.includes(field));
    return new IdentityError("validation", named.length === 0 ? {} : { fields: named });
  }
  return new IdentityError("unknown");
};
