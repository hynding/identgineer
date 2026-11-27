/** The codes of the components package's `DashboardErrorCode` that the CMS source answers. */
export type CmsDashboardErrorCode =
  "unauthenticated" | "not-found" | "unavailable" | "invalid-request" | "invalid-response";

export type CmsDashboardMethod = "listProperties" | "listEvents" | "summary";

// Fixed text per code: nothing the server sent, no id and no URL is ever part of a message.
const MESSAGES: Readonly<Record<CmsDashboardErrorCode, string>> = {
  unauthenticated: "no one is signed in, or the session has ended",
  "not-found": "the property was not found",
  unavailable: "the CMS could not answer",
  "invalid-request": "the call's arguments are not valid; nothing was sent",
  "invalid-response": "the CMS answered something that is not the answer asked for",
};

/**
 * The only error the CMS dashboard source rejects with. Its `name` is `DashboardError`, so the
 * components package's `validatedSource` carries its `code` on as its own `DashboardError`
 * (this package cannot import that class).
 */
export class CmsDashboardError extends Error {
  override readonly name = "DashboardError";
  readonly code: CmsDashboardErrorCode;

  constructor(method: CmsDashboardMethod, code: CmsDashboardErrorCode) {
    super(`${method}: ${MESSAGES[code]}`);
    this.code = code;
  }
}
