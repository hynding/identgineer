import type { IdentityErrorCode } from "./identity-types";

/** The messages every identity form shows about an attempt. */
export interface FeedbackLabels {
  /** The countdown while attempts are refused. `{time}` is the wait, as `m:ss`. */
  readonly errorThrottled: string;
  /** Attempts are refused but the client did not say for how long. */
  readonly errorThrottledWait: string;
  /** Announced once the wait is over. */
  readonly throttleOver: string;
  readonly errorNetwork: string;
  /** The service refused the input without saying which field. */
  readonly errorValidation: string;
  /** Some fields are marked: the summary above the form. */
  readonly errorFields: string;
  readonly errorUnknown: string;
  /** The button that sends the form again after a network failure. */
  readonly retry: string;
}

export const FEEDBACK_LABELS: FeedbackLabels = {
  errorThrottled: "Too many attempts. You can try again in {time}.",
  errorThrottledWait: "Too many attempts. Wait a moment, then try again.",
  throttleOver: "You can try again now.",
  errorNetwork: "The service could not be reached. Check your connection and try again.",
  errorValidation: "Some details are not valid. Check them and try again.",
  errorFields: "Some details are missing or not valid. Check the marked fields.",
  errorUnknown: "Something went wrong. Try again later.",
  retry: "Try again",
};

/** What a summary says: a code's message, or that fields are marked. */
export type SummaryCode = IdentityErrorCode | "fields";

/**
 * The fixed message for a summary. A form gives its own words for the codes it can meet
 * (`specific`); every other code falls back to the shared messages, and to "something went wrong".
 */
export function summaryMessage(
  code: SummaryCode,
  labels: FeedbackLabels,
  specific: Partial<Record<IdentityErrorCode, string>> = {},
): string {
  const own = code === "fields" ? undefined : specific[code];
  if (own !== undefined) return own;
  switch (code) {
    case "fields":
      return labels.errorFields;
    case "network":
      return labels.errorNetwork;
    case "validation":
      return labels.errorValidation;
    case "throttled":
      return labels.errorThrottledWait;
    default:
      return labels.errorUnknown;
  }
}
