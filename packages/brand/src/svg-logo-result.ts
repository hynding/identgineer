import type { SanitisedSvg } from "./sanitised-svg.ts";

/** Why a whole document was refused. Each names a rule of the strict reader or a limit. */
export type SvgLogoErrorCode =
  | "wrong-type"
  | "invalid-option"
  | "too-large"
  | "invalid-encoding"
  | "invalid-character"
  | "malformed"
  | "doctype"
  | "processing-instruction"
  | "invalid-declaration"
  | "invalid-name"
  | "duplicate-attribute"
  | "invalid-entity"
  | "mismatched-tag"
  | "invalid-comment"
  | "invalid-namespace"
  | "not-svg"
  | "too-many-elements"
  | "too-deep"
  | "too-many-attributes"
  | "too-long"
  | "number-out-of-range"
  | "too-many-stops"
  | "too-many-ids"
  | "duplicate-id"
  | "reference-cycle"
  | "reference-too-deep"
  | "expansion-too-large"
  | "drawing-too-costly"
  | "overdraw-too-large"
  | "too-many-masks"
  | "masks-too-deep"
  | "missing-size"
  /**
   * A form the sanitiser deliberately does not support, since no rewrite of it is sure to show
   * no more than the original; the message says what to change.
   */
  | "unsupported-feature"
  | "internal-error";

/**
 * Located where the text allows: `line` and `column` (in UTF-16 code units) count from 1, after a
 * leading byte order mark is removed and line ends are read as XML reads them. The message never
 * repeats the input.
 */
export interface SvgLogoError {
  readonly code: SvgLogoErrorCode;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/** Why one element, attribute or style declaration was left out of the output. */
export type SvgLogoRemovalReason =
  | "active-content"
  | "event-handler"
  | "external-reference"
  | "styling"
  | "editor-metadata"
  | "text"
  | "filter"
  | "foreign-namespace"
  | "unsupported-element"
  | "unsupported-attribute"
  | "invalid-value"
  | "misplaced"
  | "dangling-reference"
  | "character-data"
  /** A document type declaration with no internal subset: read, never honoured, not written. */
  | "document-type"
  /**
   * Valid, but able to make the logo far costlier to draw than its budgets can see, or ignored by
   * browsers; dropped only where the picture stays the same or shows less, never more (see the
   * README).
   */
  | "render-cost"
  /**
   * A clip path of more than one shape, or clipped in turn or itself, written as an alpha mask of
   * the same shapes: the picture is the same, and no renderer has to combine the shapes (see the
   * README).
   */
  | "rewritten";

/**
 * One thing the sanitiser dropped. `element` and `attribute` are names as written (names only ever
 * hold ASCII name characters, so they are safe to show), or `!DOCTYPE` for a skipped document type
 * declaration; `property` is a declaration of a `style` attribute. A removed element takes
 * everything inside it along.
 */
export interface SvgLogoRemoval {
  readonly element: string;
  readonly attribute?: string;
  readonly property?: string;
  readonly reason: SvgLogoRemovalReason;
  readonly line: number;
  readonly column: number;
}

export interface SvgLogoAccepted {
  readonly ok: true;
  /** The logo rebuilt from its parsed tree: canonical, deterministic and inert. */
  readonly svg: SanitisedSvg;
  /** In CSS pixels, as written on the root or taken from the view box. */
  readonly width: number;
  readonly height: number;
  /** `[minX, minY, width, height]`, as written on the root or derived from its size. */
  readonly viewBox: readonly [number, number, number, number];
  /** What drawing it costs, within `SVG_LOGO_LIMITS.drawingCost`; see `SVG_DRAWING_WEIGHTS`. */
  readonly drawingCost: number;
  /**
   * What painting it costs, within `SVG_LOGO_LIMITS.overdraw`: in squares on the larger side of the
   * view box painted once in a solid colour; see `SVG_OVERDRAW_WEIGHTS`.
   */
  readonly overdraw: number;
  /** The first `MAX_REPORTED_REMOVALS`, in document order. */
  readonly removed: readonly SvgLogoRemoval[];
  /** Every removal, reported or not. */
  readonly removedCount: number;
}

export type SvgLogoResult =
  SvgLogoAccepted | { readonly ok: false; readonly errors: readonly SvgLogoError[] };

export const MAX_REPORTED_REMOVALS = 100;
