import type { Clock } from "./clock.ts";
import { IdentityError } from "./identity-error.ts";

const FREE_SIGN_IN_FAILURES = 2;
const MAX_BACKOFF_SECONDS = 300;

export interface Throttle {
  /** Throws a `throttled` error with the seconds left while attempts are held back. */
  readonly check: () => void;
  readonly remainingSeconds: () => number;
  readonly serverThrottled: (retryAfterSeconds: number) => void;
  readonly signInFailed: () => void;
  readonly signInSucceeded: () => void;
}

/**
 * Holds credential attempts back locally: for as long as the server asked after a 429, and with
 * an exponential backoff after repeated failed sign-ins, so a form cannot hammer the endpoint.
 */
export const createThrottle = (clock: Clock): Throttle => {
  let serverUntil = 0;
  let backoffUntil = 0;
  let failures = 0;
  const after = (seconds: number): number => clock.now() + seconds * 1000;
  const remainingSeconds = (): number =>
    Math.max(0, Math.ceil((Math.max(serverUntil, backoffUntil) - clock.now()) / 1000));
  return {
    check: () => {
      const retryAfterSeconds = remainingSeconds();
      if (retryAfterSeconds > 0) throw new IdentityError("throttled", { retryAfterSeconds });
    },
    remainingSeconds,
    serverThrottled: (retryAfterSeconds) => {
      serverUntil = Math.max(serverUntil, after(retryAfterSeconds));
    },
    signInFailed: () => {
      failures += 1;
      if (failures > FREE_SIGN_IN_FAILURES) {
        backoffUntil = after(
          Math.min(MAX_BACKOFF_SECONDS, 2 ** (failures - FREE_SIGN_IN_FAILURES)),
        );
      }
    },
    signInSucceeded: () => {
      failures = 0;
      backoffUntil = 0;
    },
  };
};
