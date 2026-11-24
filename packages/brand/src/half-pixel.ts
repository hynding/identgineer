/**
 * The largest size the budgets are measured at, in device pixels along the larger side: 2000 CSS
 * pixels at a device pixel ratio of 2.
 */
const MEASURED_DEVICE_PIXELS = 4000;

/**
 * Whether two parts of user space, each as x, y, width and height, have every edge within half a
 * device pixel of each other when the first is drawn across the largest size measured: an output
 * showing the second where the original showed the first then shows nothing antialiasing does not
 * hide. A margin far below a pixel absorbs the rounding of the arithmetic itself.
 */
export function showsTheSameToHalfAPixel(
  exact: readonly [number, number, number, number],
  shown: readonly [number, number, number, number],
): boolean {
  const [x, y, width, height] = exact;
  const [shownX, shownY, shownWidth, shownHeight] = shown;
  const apart = Math.max(
    Math.abs(shownX - x),
    Math.abs(shownY - y),
    Math.abs(shownX + shownWidth - (x + width)),
    Math.abs(shownY + shownHeight - (y + height)),
  );
  return (apart * MEASURED_DEVICE_PIXELS) / Math.max(width, height) <= 0.5 + 1e-9;
}
