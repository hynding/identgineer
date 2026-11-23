const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300_000;
const MAX_RETRY_AFTER_MS = 3_600_000;

const unit = (answer: number): number =>
  Number.isFinite(answer) ? Math.min(1, Math.max(0, answer)) : 0.5;

/**
 * How long to wait after the given number of failed attempts in a row: a delay that doubles from
 * a second up to five minutes, then jittered to between half and all of it so that tabs and
 * visitors that failed together do not return together.
 */
export const backoffDelay = (attempt: number, random: () => number): number => {
  const step = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(step - 1, 30));
  return Math.round(ceiling / 2 + (ceiling / 2) * unit(random()));
};

/** The backoff, or the wait the server asked for (at most an hour) when that is longer. */
export const retryDelay = (
  attempt: number,
  retryAfterSeconds: number | undefined,
  random: () => number,
): number =>
  Math.max(
    backoffDelay(attempt, random),
    Math.min(MAX_RETRY_AFTER_MS, (retryAfterSeconds ?? 0) * 1000),
  );
