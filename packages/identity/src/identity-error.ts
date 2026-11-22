export const IDENTITY_ERROR_CODES = [
  "invalid-credentials",
  "throttled",
  "network",
  "validation",
  "unauthorized",
  "email-not-confirmed",
  "unknown",
] as const;

export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

// Fixed text per code: a server's own message can tell an account exists, so none is passed on.
const MESSAGES: Readonly<Record<IdentityErrorCode, string>> = {
  "invalid-credentials": "The sign-in details are not correct.",
  throttled: "Too many attempts. Wait before trying again.",
  network: "The identity service could not be reached.",
  validation: "Some of the details are not valid.",
  unauthorized: "You need to sign in again.",
  "email-not-confirmed": "Confirm your email address before signing in.",
  unknown: "Something went wrong. Try again later.",
};

export interface IdentityErrorDetails {
  /** Whole seconds until another attempt is accepted (`throttled` only). */
  readonly retryAfterSeconds?: number;
  /** The input fields that were refused (`validation` of registration or profile input only). */
  readonly fields?: readonly string[];
}

/** The only error the identity client throws or rejects with. */
export class IdentityError extends Error {
  override readonly name = "IdentityError";
  readonly code: IdentityErrorCode;
  declare readonly retryAfterSeconds?: number;
  declare readonly fields?: readonly string[];

  constructor(code: IdentityErrorCode, details: IdentityErrorDetails = {}) {
    super(MESSAGES[code]);
    this.code = code;
    if (details.retryAfterSeconds !== undefined) {
      Object.defineProperty(this, "retryAfterSeconds", {
        value: details.retryAfterSeconds,
        enumerable: true,
      });
    }
    if (details.fields !== undefined) {
      Object.defineProperty(this, "fields", {
        value: Object.freeze([...details.fields]),
        enumerable: true,
      });
    }
  }

  toJSON(): { name: string; code: IdentityErrorCode } & IdentityErrorDetails {
    return {
      name: this.name,
      code: this.code,
      ...(this.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: this.retryAfterSeconds }),
      ...(this.fields === undefined ? {} : { fields: this.fields }),
    };
  }
}
