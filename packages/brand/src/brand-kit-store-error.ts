export type BrandKitStoreErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation"
  | "not-applied"
  | "rate-limited"
  | "network"
  | "request-refused"
  | "malformed-response"
  | "unexpected-status";

// Fixed text per code: nothing the server or the kit holds is ever part of a message.
const MESSAGES: Readonly<Record<BrandKitStoreErrorCode, string>> = {
  unauthorized: "You need to sign in again.",
  forbidden: "You may not change this brand kit.",
  "not-found": "The brand kit was not found.",
  validation: "Some of the brand kit's details are not valid.",
  "not-applied": "The CMS did not save every change to the brand kit.",
  "rate-limited": "Too many requests. Wait before trying again.",
  network: "The CMS could not be reached.",
  "request-refused":
    "The fetch given to the brand kit store refused the request. Check that it serves the store's base URL.",
  "malformed-response": "The CMS answered with something that is not a brand kit answer.",
  "unexpected-status": "The CMS could not do that. Try again later.",
};

export interface BrandKitStoreErrorDetails {
  /** The HTTP status (`unexpected-status` only). */
  readonly status?: number;
  /** Whole seconds until another request is accepted (`rate-limited` only). */
  readonly retryAfterSeconds?: number;
  /** The CMS fields refused (`validation`) or not saved as sent (`not-applied`), never a value. */
  readonly fields?: readonly string[];
}

/** The only error the brand kit store rejects with. */
export class BrandKitStoreError extends Error {
  override readonly name = "BrandKitStoreError";
  readonly code: BrandKitStoreErrorCode;
  declare readonly status?: number;
  declare readonly retryAfterSeconds?: number;
  declare readonly fields?: readonly string[];

  constructor(code: BrandKitStoreErrorCode, details: BrandKitStoreErrorDetails = {}) {
    super(MESSAGES[code]);
    this.code = code;
    if (details.status !== undefined) {
      Object.defineProperty(this, "status", { value: details.status, enumerable: true });
    }
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

  toJSON(): { name: string; code: BrandKitStoreErrorCode } & BrandKitStoreErrorDetails {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: this.retryAfterSeconds }),
      ...(this.fields === undefined ? {} : { fields: this.fields }),
    };
  }
}
