import { EMPTY_BOX, type SvgBox } from "./svg-drawing-cost.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";

/** `[a, b, c, d, e, f]`, mapping (x, y) to (ax + cy + e, bx + dy + f), as SVG writes a matrix. */
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/**
 * The most any entry of a composed matrix may be: a million times a million. No logo needs to
 * magnify further, and every product the walk forms from such a matrix and a coordinate (under a
 * million) stays far inside a double, so no number it reports can overflow to an infinity or to
 * one that is not a number.
 */
export const MATRIX_BOUND = 1e12;

/** `m`, refused when any entry is past `MATRIX_BOUND` or not a number. */
export function bounded(m: Matrix): Matrix {
  if (!m.every((entry) => Math.abs(entry) <= MATRIX_BOUND)) {
    throw new SvgLogoRejection(
      "number-out-of-range",
      `composes transforms past ${String(MATRIX_BOUND)} times`,
    );
  }
  return m;
}

/** `m` then `n`, refused past `MATRIX_BOUND`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  return bounded([
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]);
}

function transformFunction(name: string, values: readonly number[]): Matrix {
  const [p = 0, q, r = 0] = values;
  const radians = (p * Math.PI) / 180;
  switch (name) {
    case "matrix":
      return [p, values[1] ?? 0, r, values[3] ?? 0, values[4] ?? 0, values[5] ?? 0];
    case "translate":
      return [1, 0, 0, 1, p, q ?? 0];
    case "scale":
      return [p, 0, 0, q ?? p, 0, 0];
    case "rotate": {
      const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
      const [cx, cy] = [q ?? 0, r];
      return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
    }
    case "skewX":
      return [1, 0, Math.tan(radians), 1, 0, 0];
    case "skewY":
      return [1, Math.tan(radians), 0, 1, 0, 0];
    default:
      throw new Error(`a kept transform has the function ${name}, which no grammar keeps`);
  }
}

/** A kept transform list (`name(a b) name(c)`) as one matrix. */
export function parseTransform(text: string): Matrix {
  let matrix = IDENTITY;
  for (const [, name = "", values = ""] of text.matchAll(/([A-Za-z]+)\(([^)]*)\)/g)) {
    matrix = multiply(matrix, bounded(transformFunction(name, values.split(" ").map(Number))));
  }
  return matrix;
}

/** The inverse of `m`, or `undefined` when it flattens the plane. */
export function invert(m: Matrix): Matrix | undefined {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return undefined;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** How much a matrix scales areas. */
export function determinant(m: Matrix): number {
  return Math.abs(m[0] * m[3] - m[1] * m[2]);
}

/** How much a matrix can lengthen a line: its largest singular value. */
export function stretch(m: Matrix): number {
  const sum = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] + m[3] * m[3];
  const det = determinant(m);
  return Math.sqrt((sum + Math.sqrt(Math.max(0, sum * sum - 4 * det * det))) / 2);
}

/** The axis-aligned box around a box mapped by a matrix. */
export function mapBox(m: Matrix, box: SvgBox): SvgBox {
  if (box.minX > box.maxX) return EMPTY_BOX;
  const corners = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.minX, box.maxY],
    [box.maxX, box.maxY],
  ] as const;
  const xs = corners.map(([x, y]) => m[0] * x + m[2] * y + m[4]);
  const ys = corners.map(([x, y]) => m[1] * x + m[3] * y + m[5]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}
