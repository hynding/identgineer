import type { ProfileClient } from "../../identity/identity-types";
import type { CountdownClock } from "../../identity/throttle-countdown";
import type { ProfileLabels } from "./profile-labels";

/** What a section of `idg-profile` asks of the element: the client, the text, timers, a redraw. */
export interface SectionHost {
  readonly client: () => ProfileClient | undefined;
  readonly labels: () => ProfileLabels;
  readonly timers: () => CountdownClock;
  /** The section's state changed: draw again. */
  readonly changed: () => void;
}

/** The parts of a load: under way, done, or failed (`network` can be retried). */
export type LoadState = "loading" | "ready" | "network" | "failed";
