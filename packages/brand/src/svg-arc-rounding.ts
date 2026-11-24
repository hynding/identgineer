/** One arc of path data, absolute: from (x1, y1) to (x2, y2), its radii and angle in degrees. */
export interface SvgArc {
  readonly x1: number;
  readonly y1: number;
  readonly rx: number;
  readonly ry: number;
  readonly angle: number;
  readonly large: boolean;
  readonly sweep: boolean;
  readonly x2: number;
  readonly y2: number;
}

/** An arc as SVG draws it: an ellipse's centre, radii and turn, and the part of it drawn. */
interface ArcShape {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly turn: number;
  readonly start: number;
  readonly extent: number;
}

/**
 * How SVG draws an arc (SVG 1.1, F.6.5 and F.6.6, which Chromium follows): nothing where its ends
 * coincide, a line where a radius is zero, and otherwise the ellipse through both ends, its radii
 * scaled up to fit where they are too small.
 */
function shapeOf(arc: SvgArc): ArcShape | "omitted" | "line" {
  if (arc.x1 === arc.x2 && arc.y1 === arc.y2) return "omitted";
  let [rx, ry] = [Math.abs(arc.rx), Math.abs(arc.ry)];
  if (rx === 0 || ry === 0) return "line";
  const turn = (arc.angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const [dx, dy] = [(arc.x1 - arc.x2) / 2, (arc.y1 - arc.y2) / 2];
  const x = cos * dx + sin * dy;
  const y = -sin * dx + cos * dy;
  const lambda = (x / rx) ** 2 + (y / ry) ** 2;
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const across = (rx * y) ** 2 + (ry * x) ** 2;
  const root = Math.sqrt(Math.max(0, ((rx * ry) ** 2 - across) / across));
  const sign = arc.large === arc.sweep ? -1 : 1;
  const [centreX, centreY] = [(sign * root * rx * y) / ry, (-sign * root * ry * x) / rx];
  const start = Math.atan2((y - centreY) / ry, (x - centreX) / rx);
  let extent = Math.atan2((-y - centreY) / ry, (-x - centreX) / rx) - start;
  if (arc.sweep && extent < 0) extent += 2 * Math.PI;
  if (!arc.sweep && extent > 0) extent -= 2 * Math.PI;
  return {
    cx: cos * centreX - sin * centreY + (arc.x1 + arc.x2) / 2,
    cy: sin * centreX + cos * centreY + (arc.y1 + arc.y2) / 2,
    rx,
    ry,
    turn,
    start,
    extent,
  };
}

/** The difference of two angles, as the shorter way round. */
function angleBetween(a: number, b: number): number {
  const turns = (a - b) / (2 * Math.PI);
  return Math.abs(turns - Math.round(turns)) * 2 * Math.PI;
}

/**
 * How far from where it starts any point of an arc lies: no further than the far side of its
 * ellipse, nor than the length of the arc, which its larger radius times its extent bounds.
 */
function reach(shape: ArcShape, arc: SvgArc): number {
  const larger = Math.max(shape.rx, shape.ry);
  return Math.min(
    Math.hypot(shape.cx - arc.x1, shape.cy - arc.y1) + larger,
    larger * Math.abs(shape.extent),
  );
}

/** Where an arc's point at `fraction` of the way along it lies. */
function pointAt(shape: ArcShape, fraction: number): readonly [number, number] {
  const angle = shape.start + fraction * shape.extent;
  const [x, y] = [shape.rx * Math.cos(angle), shape.ry * Math.sin(angle)];
  const [cos, sin] = [Math.cos(shape.turn), Math.sin(shape.turn)];
  return [shape.cx + cos * x - sin * y, shape.cy + sin * x + cos * y];
}

/** Points taken along each arc to measure how far apart they are; see `apart`. */
const SAMPLES = 64;

/**
 * How far apart the points at the same fraction of two arcs can be. The distance is the length of
 * the difference of the two points, which changes along the arcs no faster than the difference of
 * their velocities: with each point's angle on its ellipse running at its extent, that is at most
 * the extents' change times the larger radius, plus the extent times how far apart the two
 * ellipses' tangent vectors can be (the radii's change and the angles' change times the larger
 * radius), plus the turn's change times the speed. So the largest distance is at most the largest
 * at evenly spaced points plus that rate times half the spacing.
 */
function apart(original: ArcShape, shown: ArcShape, moved: number): number {
  const [larger, largerShown] = [Math.max(original.rx, original.ry), Math.max(shown.rx, shown.ry)];
  const turn = angleBetween(original.turn, shown.turn);
  const angles =
    angleBetween(original.start, shown.start) + Math.abs(original.extent - shown.extent);
  const rate =
    Math.abs(original.extent - shown.extent) * larger +
    Math.abs(shown.extent) *
      (Math.hypot(original.rx - shown.rx, original.ry - shown.ry) + largerShown * angles) +
    turn * Math.abs(original.extent) * larger;
  // The same distance bounded at once: the centre's move, the turn's change times the larger
  // radius, the radii's change, and the angles' change times the larger radius. Where that is
  // already within twice the numbers' own change, the arc moved as its numbers did.
  const direct =
    Math.hypot(original.cx - shown.cx, original.cy - shown.cy) +
    turn * larger +
    Math.hypot(original.rx - shown.rx, original.ry - shown.ry) +
    largerShown * angles;
  if (direct <= 2 * moved) return direct;
  let largest = 0;
  for (let sample = 0; sample <= SAMPLES; sample += 1) {
    const [x, y] = pointAt(original, sample / SAMPLES);
    const [shownX, shownY] = pointAt(shown, sample / SAMPLES);
    largest = Math.max(largest, Math.hypot(x - shownX, y - shownY));
  }
  return Math.min(direct, largest + rate / (2 * SAMPLES));
}

/**
 * How far any point of an arc as written can lie from the same point of the arc exactly as given,
 * or `undefined` where no bound is known. Both are drawn as SVG draws them (see `shapeOf`), so a
 * change that moves the centre far, where the radii barely fit or the ends barely differ, counts
 * in full: the bound is on the distance between the points at the same fraction of each arc (see
 * `apart`), which no point of either arc is further than from the other. An arc whose ends coincide is drawn as nothing, so where rounding
 * makes them meet or part, every point of the drawn arc moves to its start (see `reach`).
 */
export function arcRoundingError(exact: SvgArc, written: SvgArc): number | undefined {
  const [original, shown] = [shapeOf(exact), shapeOf(written)];
  const moved = Math.hypot(exact.x1 - written.x1, exact.y1 - written.y1);
  const movedEnd = Math.hypot(exact.x2 - written.x2, exact.y2 - written.y2);
  let error: number;
  if (original === "omitted" && shown === "omitted") error = moved;
  else if (original === "line" && shown === "line") error = Math.max(moved, movedEnd);
  else if (original === "line" || shown === "line") return undefined;
  else if (original === "omitted" && shown !== "omitted") error = moved + reach(shown, written);
  else if (shown === "omitted" && original !== "omitted") error = moved + reach(original, exact);
  else if (original !== "omitted" && shown !== "omitted")
    error = apart(
      original,
      shown,
      Math.max(moved, movedEnd) + Math.hypot(exact.rx - written.rx, exact.ry - written.ry),
    );
  else return undefined;
  return Number.isFinite(error) ? error : undefined;
}
