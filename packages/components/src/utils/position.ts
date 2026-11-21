export const PLACEMENTS = [
  "top",
  "top-start",
  "top-end",
  "bottom",
  "bottom-start",
  "bottom-end",
  "left",
  "left-start",
  "left-end",
  "right",
  "right-start",
  "right-end",
] as const;

export type Placement = (typeof PLACEMENTS)[number];

type Side = "top" | "bottom" | "left" | "right";
type Alignment = "start" | "center" | "end";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PositionInput {
  anchor: Rect;
  floating: Size;
  viewport: Size;
  placement: Placement;
  /** Gap between the anchor and the surface. */
  offset: number;
  /** Smallest distance the surface keeps from the viewport's edges. */
  padding: number;
}

export interface Position {
  x: number;
  y: number;
  /** The placement used, which differs from the one asked for when the surface was flipped. */
  placement: Placement;
}

const OPPOSITE: Readonly<Record<Side, Side>> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function parse(placement: Placement): [Side, Alignment] {
  const known = PLACEMENTS.includes(placement) ? placement : "bottom";
  const [side, alignment] = known.split("-") as [Side, "start" | "end" | undefined];
  return [side, alignment ?? "center"];
}

function isVertical(side: Side): boolean {
  return side === "top" || side === "bottom";
}

function mainCoordinate(side: Side, input: PositionInput): number {
  const { anchor, floating, offset } = input;
  if (side === "top") return anchor.y - offset - floating.height;
  if (side === "bottom") return anchor.y + anchor.height + offset;
  if (side === "left") return anchor.x - offset - floating.width;
  return anchor.x + anchor.width + offset;
}

function crossCoordinate(side: Side, alignment: Alignment, input: PositionInput): number {
  const { anchor, floating } = input;
  const [start, length, size] = isVertical(side)
    ? [anchor.x, anchor.width, floating.width]
    : [anchor.y, anchor.height, floating.height];
  if (alignment === "start") return start;
  if (alignment === "end") return start + length - size;
  return start + length / 2 - size / 2;
}

/** The room on a side of the anchor, less the offset and the viewport padding. */
function room(side: Side, input: PositionInput): number {
  const { anchor, viewport, offset, padding } = input;
  if (side === "top") return anchor.y - offset - padding;
  if (side === "bottom") return viewport.height - (anchor.y + anchor.height) - offset - padding;
  if (side === "left") return anchor.x - offset - padding;
  return viewport.width - (anchor.x + anchor.width) - offset - padding;
}

function clamp(value: number, size: number, extent: number, padding: number): number {
  const max = extent - padding - size;
  return Math.max(padding, Math.min(value, max));
}

function chooseSide(preferred: Side, input: PositionInput): Side {
  const need = isVertical(preferred) ? input.floating.height : input.floating.width;
  const opposite = OPPOSITE[preferred];
  if (room(preferred, input) >= need) return preferred;
  if (room(opposite, input) >= need) return opposite;
  return room(opposite, input) > room(preferred, input) ? opposite : preferred;
}

/**
 * Where to put a floating surface beside an anchor, in viewport coordinates. The surface flips to
 * the opposite side when the preferred one is too small and the other is not, then shifts along
 * both axes so it never leaves the viewport. Used where CSS anchor positioning is unavailable.
 */
export function computePosition(input: PositionInput): Position {
  const [preferred, alignment] = parse(input.placement);
  const side = chooseSide(preferred, input);
  const main = mainCoordinate(side, input);
  const cross = crossCoordinate(side, alignment, input);
  const { floating, viewport, padding } = input;
  const [x, y] = isVertical(side)
    ? [
        clamp(cross, floating.width, viewport.width, padding),
        clamp(main, floating.height, viewport.height, padding),
      ]
    : [
        clamp(main, floating.width, viewport.width, padding),
        clamp(cross, floating.height, viewport.height, padding),
      ];
  const placement: Placement = alignment === "center" ? side : `${side}-${alignment}`;
  return { x, y, placement };
}
