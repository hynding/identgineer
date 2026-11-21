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

export type RovingOrientation = "horizontal" | "vertical";

export function rovingMove(
  current: number,
  key: string,
  enabled: readonly boolean[],
  orientation: RovingOrientation,
  rightToLeft: boolean,
): number | undefined {
  return orientation === "horizontal"
    ? nextRovingIndex(current, key, enabled, rightToLeft)
    : undefined;
}
