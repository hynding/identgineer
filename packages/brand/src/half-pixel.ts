/** The largest size the budgets are measured at, in device pixels along the larger side. */
const MEASURED_PIXELS = 2000;

/**
 * Whether writing `exact` as `written` moves what it places by more than half a pixel, when `span`
 * user units are drawn across the largest size measured: further than antialiasing hides, so the
 * move could show something the original did not.
 */
export function movesMoreThanHalfAPixel(exact: number, written: number, span: number): boolean {
  return !((Math.abs(written - exact) * MEASURED_PIXELS) / span <= 0.5);
}
