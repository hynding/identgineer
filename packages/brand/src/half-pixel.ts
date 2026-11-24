/**
 * The largest size the budgets are measured at, in device pixels along the larger side: 2000 CSS
 * pixels at a device pixel ratio of 2.
 */
const MEASURED_DEVICE_PIXELS = 4000;

/**
 * Whether writing `exact` as `written` moves what it places by more than half a device pixel, when
 * `span` user units are drawn across the largest size measured: further than antialiasing hides, so
 * the move could show something the original did not.
 */
export function movesMoreThanHalfAPixel(exact: number, written: number, span: number): boolean {
  return !((Math.abs(written - exact) * MEASURED_DEVICE_PIXELS) / span <= 0.5);
}

/**
 * Whether drawing a view box of one shape to fit a frame of another, rather than stretched to fill
 * it, moves anything by more than half a device pixel at the largest size measured: a frame whose
 * size was worked out to six decimals from the view box's proportions does not.
 */
export function stretchesByMoreThanHalfAPixel(
  box: { readonly width: number; readonly height: number },
  frame: { readonly width: number; readonly height: number },
): boolean {
  const across = frame.width / box.width;
  const down = frame.height / box.height;
  return !((Math.abs(across - down) / Math.max(across, down)) * MEASURED_DEVICE_PIXELS <= 0.5);
}
