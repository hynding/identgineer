import type { ConsentClient, ConsentStatusView } from "./consent-types";

const STATES = new Set(["unknown", "granted", "denied"]);
const SIGNALS = new Set<unknown>(["gpc", "dnt", undefined]);

/** What went wrong, for the component to say: the state could not be read. */
export type ConsentFailure = "read";

function isConsentClient(value: unknown): value is ConsentClient {
  const candidate = value as Partial<Record<keyof ConsentClient, unknown>> | null | undefined;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.get === "function" &&
    typeof candidate.grant === "function" &&
    typeof candidate.deny === "function" &&
    typeof candidate.reset === "function" &&
    typeof candidate.onChange === "function"
  );
}

function isStatus(value: unknown): value is ConsentStatusView {
  const candidate = value as { state?: unknown; reason?: unknown } | null | undefined;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    STATES.has(candidate.state as string) &&
    SIGNALS.has(candidate.reason)
  );
}

/**
 * Keeps a component subscribed to the consent object it is given: the `consent` property may be
 * set after the element is connected, swapped for another, or cleared. Each bind reports the
 * current status, then every change, until the next bind or `unbind`. Nothing the object does
 * reaches the page as an exception: a `get()` that throws or answers with something that is not a
 * status is a failure for the component to show, and an `onChange` that throws means no live
 * updates, not no component.
 */
export class ConsentBinding {
  private consent?: ConsentClient;
  private stop?: () => void;

  constructor(
    private readonly onStatus: (status: ConsentStatusView) => void,
    private readonly onFailure: (failure: ConsentFailure) => void,
  ) {}

  bind(consent: ConsentClient | undefined): void {
    if (consent !== undefined && consent === this.consent) return;
    this.unbind();
    if (!isConsentClient(consent)) return;
    this.consent = consent;
    try {
      this.stop = consent.onChange((status) => {
        if (this.consent === consent) this.report(status);
      });
    } catch {
      // Without live updates the component still shows the state it read, and the actions re-read.
    }
    this.refresh();
  }

  unbind(): void {
    const stop = this.stop;
    this.stop = undefined;
    this.consent = undefined;
    try {
      stop?.();
    } catch {
      // The object is let go either way.
    }
  }

  current(): ConsentClient | undefined {
    return this.consent;
  }

  /** Reads the status afresh, as after an action whose outcome the object did not announce. */
  refresh(): void {
    const consent = this.consent;
    if (consent === undefined) return;
    let status: unknown;
    try {
      status = consent.get();
    } catch {
      this.onFailure("read");
      return;
    }
    this.report(status);
  }

  private report(status: unknown): void {
    if (isStatus(status)) this.onStatus(status);
    else this.onFailure("read");
  }
}
