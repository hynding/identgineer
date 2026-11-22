import { fillTemplate } from "./labels";
import type { FeedbackLabels, SummaryCode } from "./feedback-labels";
import type { IdentityFailure } from "./identity-error";
import type { ThrottleSource } from "./identity-types";
import { formatWait, ThrottleCountdown, type CountdownClock } from "./throttle-countdown";

export interface Summary {
  readonly code: SummaryCode;
  /** New for every summary, so the alert is drawn afresh and announced again. */
  readonly key: number;
}

export interface Announcement {
  readonly text: string;
  /**
   * A live region announces what is added, so the same words twice in one node would be silent the
   * second time: the text is written into one of two nodes, alternately.
   */
  readonly slot: 0 | 1;
}

/**
 * What an identity form shows about its last attempt: a summary, the marked fields, a throttle
 * countdown and a polite announcement. The form draws it; this keeps it, and calls `changed`
 * whenever the form should draw again.
 */
export class FormFeedback {
  summary: Summary | undefined;
  fieldErrors: Readonly<Record<string, string>> = {};
  throttleSeconds = 0;
  announcement: Announcement = { text: "", slot: 0 };

  private keys = 0;
  private labels?: FeedbackLabels;
  private readonly countdown = new ThrottleCountdown((seconds) => {
    const wasCounting = this.throttleSeconds > 0;
    this.throttleSeconds = seconds;
    if (seconds === 0 && wasCounting && this.labels) this.announce(this.labels.throttleOver);
    this.changed();
  });

  constructor(private readonly changed: () => void) {}

  /** Before an attempt: nothing to say yet. The countdown, if any, runs on. */
  clear(): void {
    this.summary = undefined;
    this.fieldErrors = {};
    this.changed();
  }

  /** The fields the form found wrong itself, or the server named, with their messages. */
  markFields(errors: Readonly<Record<string, string>>): void {
    this.fieldErrors = errors;
    this.summary = { code: "fields", key: (this.keys += 1) };
    this.changed();
  }

  /**
   * A failed attempt. `throttled` starts the countdown from the client's own wait, announced once
   * now and once when it is over, never every second.
   */
  fail(
    failure: IdentityFailure,
    throttle: ThrottleSource | undefined,
    clock: CountdownClock,
    labels: FeedbackLabels,
  ): void {
    this.labels = labels;
    this.fieldErrors = {};
    if (failure.code === "throttled" && throttle) {
      this.countdown.start(() => throttle.retryAfterSeconds(), clock);
      if (this.throttleSeconds > 0) {
        this.summary = undefined;
        this.announce(
          fillTemplate(labels.errorThrottled, { time: formatWait(this.throttleSeconds) }),
        );
        this.changed();
        return;
      }
    }
    this.summary = { code: failure.code, key: (this.keys += 1) };
    this.changed();
  }

  announce(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
    this.changed();
  }

  /** Forgets everything and stops the countdown, as when the client changes or the form goes. */
  reset(): void {
    this.countdown.stop();
    this.summary = undefined;
    this.fieldErrors = {};
    this.throttleSeconds = 0;
    this.changed();
  }
}
