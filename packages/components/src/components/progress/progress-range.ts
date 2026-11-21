const DEFAULT_MAX = 100;

export interface ProgressRange {
  /** `undefined` when the progress cannot be measured. */
  value: number | undefined;
  max: number;
}

/** A value and maximum that the native element would accept: a positive maximum, a value inside it. */
export function progressRange(
  value: number | undefined,
  max: number | undefined,
  indeterminate: boolean,
): ProgressRange {
  const limit = max !== undefined && Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX;
  if (indeterminate || value === undefined || !Number.isFinite(value)) {
    return { value: undefined, max: limit };
  }
  return { value: Math.min(Math.max(value, 0), limit), max: limit };
}
