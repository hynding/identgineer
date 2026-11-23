/** The drawing's own units; the SVG scales them to its container. */
export const VIEW_WIDTH = 100;
export const VIEW_HEIGHT = 30;

// Room for the stroke and the end mark, so neither is cut at the edge of the view box.
const PADDING_X = 4;
const PADDING_Y = 4;

export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

export interface SparklineShape {
  /** The path of the line, or empty when there is nothing to join. */
  readonly line: string;
  /** The line closed down to the baseline, for the fill under it. */
  readonly area: string;
  /** Where the last value is, for the mark that ends the line. */
  readonly end: SparklinePoint | undefined;
}

const round = (value: number): number => Number(value.toFixed(2));

/**
 * The path for a series that is already finite and short enough to draw. The value range is taken
 * in halves, so a series that runs from one extreme of a double to the other does not overflow
 * to Infinity and draw nothing.
 */
export function sparklineShape(values: readonly number[]): SparklineShape {
  if (values.length === 0) return { line: "", area: "", end: undefined };
  if (values.length === 1) {
    return { line: "", area: "", end: { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 } };
  }
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const span = highest / 2 - lowest / 2;
  const width = VIEW_WIDTH - 2 * PADDING_X;
  const height = VIEW_HEIGHT - 2 * PADDING_Y;
  const baseline = VIEW_HEIGHT - PADDING_Y;
  const points = values.map((value, index): SparklinePoint => {
    const share = span > 0 ? (value / 2 - lowest / 2) / span : 0.5;
    return {
      x: round(PADDING_X + (index * width) / (values.length - 1)),
      y: round(PADDING_Y + (1 - Math.min(Math.max(share, 0), 1)) * height),
    };
  });
  const line = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${String(x)} ${String(y)}`)
    .join(" ");
  const first = points[0] as SparklinePoint;
  const last = points[points.length - 1] as SparklinePoint;
  return {
    line,
    area: `${line} L${String(last.x)} ${String(baseline)} L${String(first.x)} ${String(baseline)} Z`,
    end: last,
  };
}
