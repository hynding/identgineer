import type { PageEnvironment, Unsubscribe } from "../page-environment.ts";

export interface FakePageOptions {
  readonly href?: string;
  readonly referrer?: string;
}

/** A page for tests: it holds a location, a referrer and signals, and sends the events a browser would. */
export interface FakePage extends PageEnvironment {
  readonly setReferrer: (referrer: string) => void;
  /** Moves to `href` and tells the navigation listeners, as a patched `pushState` would. */
  readonly navigate: (href: string, kind?: "push" | "replace" | "pop") => void;
  readonly hide: () => void;
  readonly goOffline: () => void;
  readonly goOnline: () => void;
  readonly setGpc: (value: boolean | undefined) => void;
  readonly setDnt: (value: string | undefined) => void;
  /** How many listeners are subscribed and not yet unsubscribed. */
  readonly listenerCount: () => number;
}

export const createFakePage = (options: FakePageOptions = {}): FakePage => {
  let href = options.href ?? "https://shop.example.com/";
  let referrer = options.referrer ?? "";
  let onLine = true;
  let gpc: boolean | undefined;
  let dnt: string | undefined;
  const hidden = new Set<() => void>();
  const online = new Set<() => void>();
  const navigation = new Set<() => void>();

  const subscribe = (set: Set<() => void>, listener: () => void): Unsubscribe => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  const emit = (set: Set<() => void>): void => {
    for (const listener of [...set]) listener();
  };

  return {
    location: () => href,
    referrer: () => referrer,
    signals: () => ({
      onLine,
      ...(gpc === undefined ? {} : { globalPrivacyControl: gpc }),
      ...(dnt === undefined ? {} : { doNotTrack: dnt }),
    }),
    onHidden: (listener) => subscribe(hidden, listener),
    onOnline: (listener) => subscribe(online, listener),
    onNavigate: (listener) => subscribe(navigation, listener),
    setReferrer: (value) => {
      referrer = value;
    },
    navigate: (next) => {
      href = next;
      emit(navigation);
    },
    hide: () => {
      emit(hidden);
    },
    goOffline: () => {
      onLine = false;
    },
    goOnline: () => {
      onLine = true;
      emit(online);
    },
    setGpc: (value) => {
      gpc = value;
    },
    setDnt: (value) => {
      dnt = value;
    },
    listenerCount: () => hidden.size + online.size + navigation.size,
  };
};
