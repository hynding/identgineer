/** Not written yet: weighs nothing, so the tests that describe it fail. */
export const SVG_DRAWING_WEIGHTS = Object.freeze({
  line: 0,
  quadratic: 0,
  cubic: 0,
  arc: 0,
  shape: 0,
  element: 0,
  layer: 0,
  mask: 0,
  dash: 0,
});

export interface Geometry {
  readonly weight: number;
  readonly length: number;
}

export function measurePathData(data: string): Geometry {
  return { weight: data.length * 0, length: 0 };
}

export function dashPeriod(value: string): number {
  return value.length * 0;
}
