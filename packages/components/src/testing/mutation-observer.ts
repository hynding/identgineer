import { vi } from "vitest";

export interface FakeRecord {
  type: "childList" | "attributes" | "characterData";
  target: Node;
}

export interface FakeObserver {
  target?: Node;
  /** Every node it was asked to observe, in order; `target` is the last. */
  targets: Node[];
  options?: MutationObserverInit;
  observing: boolean;
}

/**
 * Stencil's mock DOM has no MutationObserver, so components that watch their light DOM do not
 * create one there. This installs a recorder that a spec can fire by hand, to test what a
 * component does with the records and that it watches again after a move. Real observation is
 * checked in the browser tests.
 */
export function stubMutationObserver() {
  const observers: FakeObserver[] = [];
  const callbacks = new Map<FakeObserver, (records: FakeRecord[]) => void>();

  class RecordingObserver implements FakeObserver {
    observing = false;
    target?: Node;
    targets: Node[] = [];
    options?: MutationObserverInit;

    constructor(callback: (records: FakeRecord[]) => void) {
      observers.push(this);
      callbacks.set(this, callback);
    }

    observe(target: Node, options?: MutationObserverInit): void {
      this.target = target;
      this.targets.push(target);
      this.options = options;
      this.observing = true;
    }

    disconnect(): void {
      this.observing = false;
      this.targets = [];
    }

    takeRecords(): FakeRecord[] {
      return [];
    }
  }

  vi.stubGlobal("MutationObserver", RecordingObserver);

  return {
    observers,
    /** Calls every observer that is watching, as the browser would for these records. */
    notify(records: FakeRecord[]): void {
      for (const observer of observers) {
        if (observer.observing) callbacks.get(observer)?.(records);
      }
    },
    restore(): void {
      vi.unstubAllGlobals();
    },
  };
}
