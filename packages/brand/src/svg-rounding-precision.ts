import { MEASURED_DEVICE_PIXELS } from "./half-pixel.ts";
import { largestUnitSize } from "./svg-drawing-cost.ts";
import type { CleanElement } from "./filter-svg-tree.ts";
import { invert, type Matrix, product, stretch, transformFunctions } from "./svg-matrix.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import type { SvgValue } from "./svg-values.ts";

/** Half a device pixel, and a margin far below it for the rounding of the arithmetic itself. */
const HALF_A_PIXEL = 0.5 + 1e-9;

/**
 * How far rounding to six decimals moves what a logo shows, in device pixels at the largest size
 * measured, and the refusal of a logo where that can pass half a device pixel. Each number rounding
 * changed counts its change times the magnification applied to it; the changes along the way to
 * anything drawn add up. A number rounding did not change counts nothing, however magnified.
 */
export class RoundingPrecision {
  /** Device pixels per unit of the view box. */
  private readonly scale: number;
  private readonly corners: readonly (readonly [number, number])[];

  constructor(viewBox: readonly number[]) {
    const [x = 0, y = 0, width = 1, height = 1] = viewBox;
    this.scale = MEASURED_DEVICE_PIXELS / Math.max(width, height);
    this.corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ];
  }

  /** What a value's rounding moves, in user units under `matrix`, moves on the device. */
  shift(error: number, matrix: Matrix): number {
    return error > 0 ? error * this.scale * stretch(matrix) : 0;
  }

  /**
   * The rounding of the numbers `names` on `element`, each in the user units its own unit gives
   * (a percentage taken of `percentBase`), at most.
   */
  errorOf(element: CleanElement, names: readonly string[], percentBase: number): number {
    return Math.max(
      0,
      ...names.map((name) => valueError(element.attributes.get(name), percentBase)),
    );
  }

  /**
   * What rounding a transform list moves, drawn under `before`. Each function rounding changed
   * moves a point it carries by its change, magnified by what comes before it; the points that
   * matter are those the view box shows, which lie within reach of the corners once mapped back.
   */
  transform(value: SvgValue | undefined, before: Matrix): number {
    if (value === undefined || !("text" in value) || value.exactTransform === undefined) return 0;
    const exact = transformFunctions(value.exactTransform);
    const written = transformFunctions(value.text);
    let prefix = before;
    let moved = 0;
    for (const [index, item] of written.entries()) {
      const original = exact[index] ?? item;
      const change: Matrix = [
        original[0] - item[0],
        original[1] - item[1],
        original[2] - item[2],
        original[3] - item[3],
        0,
        0,
      ];
      const offset = Math.hypot(original[4] - item[4], original[5] - item[5]);
      const linear = stretch(change);
      if (linear > 0 || offset > 0) {
        const reach = linear > 0 ? this.reach(product(prefix, item), product(prefix, original)) : 0;
        moved += this.scale * stretch(prefix) * (linear * reach + offset);
      }
      prefix = product(prefix, item);
    }
    return moved;
  }

  /** Refuses a logo whose rounding moves something by `moved` device pixels. */
  check(moved: number): void {
    // Written so that a shift that is not a number is refused too.
    if (!(moved <= HALF_A_PIXEL)) {
      throw new SvgLogoRejection(
        "unsupported-feature",
        "magnifies a number rounded to six decimals past half a device pixel",
      );
    }
  }

  /**
   * How far from where `mapped` and `original` take the origin a point either shows within the
   * view box can lie, before them; unbounded where either flattens the plane.
   */
  private reach(mapped: Matrix, original: Matrix): number {
    return Math.max(
      ...[mapped, original].map((matrix) => {
        const back = invert(matrix);
        if (back === undefined) return Infinity;
        const far = Math.max(
          ...this.corners.map(([x, y]) => Math.hypot(x - matrix[4], y - matrix[5])),
        );
        return stretch(back) * far;
      }),
    );
  }
}

/** A value's rounding error in user units, its numbers' units taken into account. */
export function valueError(value: SvgValue | undefined, percentBase: number): number {
  if (value === undefined || !("text" in value) || value.roundingError === undefined) return 0;
  return value.roundingError * largestUnitSize(value.text, percentBase);
}
