import { vi } from "vitest";

/**
 * Stencil's mock DOM has no ResizeObserver, so components that measure themselves do not create
 * one there. This installs a recorder a spec can fire by hand. Real measuring is checked in the
 * browser tests.
 */
export function stubResizeObserver() {
  interface Recorded {
    targets: Element[];
    observing: boolean;
    callback: () => void;
  }
  const observers: Recorded[] = [];

  class RecordingObserver {
    private readonly recorded: Recorded;

    constructor(callback: () => void) {
      this.recorded = { targets: [], observing: false, callback };
      observers.push(this.recorded);
    }

    observe(target: Element): void {
      this.recorded.targets.push(target);
      this.recorded.observing = true;
    }

    disconnect(): void {
      this.recorded.observing = false;
      this.recorded.targets = [];
    }

    unobserve(): void {
      // Not used by the components.
    }
  }

  vi.stubGlobal("ResizeObserver", RecordingObserver);

  return {
    observers,
    /** Calls every observer that is watching, as the browser would after a resize. */
    notify(): void {
      for (const observer of observers) {
        if (observer.observing) observer.callback();
      }
    },
    restore(): void {
      vi.unstubAllGlobals();
    },
  };
}
