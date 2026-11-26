const FORWARD = new Set(["ArrowDown", "ArrowRight"]);
const BACKWARD = new Set(["ArrowUp", "ArrowLeft"]);

/** Where an arrow key moves a roving selection, wrapping and skipping disabled items. */
export function nextRovingIndex(
  current: number,
  key: string,
  enabled: readonly boolean[],
  rightToLeft: boolean,
): number | undefined {
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const flip = horizontal && rightToLeft;
  const step = FORWARD.has(key) !== flip ? 1 : -1;
  if (!FORWARD.has(key) && !BACKWARD.has(key)) return undefined;
  const count = enabled.length;
  for (let distance = 1; distance < count; distance += 1) {
    const index = (current + step * distance + count * distance) % count;
    if (enabled[index]) return index;
  }
  return undefined;
}

/** The axis a list moves along, or both, for a list that may be drawn either way. */
export type RovingOrientation = "horizontal" | "vertical" | "both";

const AXIS_KEYS: Readonly<Record<RovingOrientation, readonly string[]>> = {
  horizontal: ["ArrowLeft", "ArrowRight"],
  vertical: ["ArrowUp", "ArrowDown"],
  both: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
};

/**
 * Where a key moves focus in a list laid out along one axis, as in tabs and an accordion: the
 * arrows of that axis step (wrapping, skipping disabled items), Home and End go to the first and
 * last enabled item, and the arrows of the other axis do nothing, unless the list answers both.
 */
export function rovingMove(
  current: number,
  key: string,
  enabled: readonly boolean[],
  orientation: RovingOrientation,
  rightToLeft: boolean,
): number | undefined {
  if (key === "Home") {
    const first = enabled.indexOf(true);
    return first === -1 ? undefined : first;
  }
  if (key === "End") {
    const last = enabled.lastIndexOf(true);
    return last === -1 ? undefined : last;
  }
  if (!AXIS_KEYS[orientation].includes(key)) return undefined;
  return nextRovingIndex(current, key, enabled, rightToLeft);
}
