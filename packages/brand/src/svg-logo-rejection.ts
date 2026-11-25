import type { SvgLogoErrorCode } from "./svg-logo-result.ts";

/**
 * Thrown inside the sanitiser to refuse the whole document, and caught at its entry point, which
 * turns it into a located error. It never leaves the package.
 */
export class SvgLogoRejection extends Error {
  readonly code: SvgLogoErrorCode;
  /** Where in the normalised text, or `undefined` for the document as a whole. */
  readonly offset: number | undefined;

  constructor(code: SvgLogoErrorCode, message: string, offset?: number) {
    super(message);
    this.code = code;
    this.offset = offset;
  }
}
