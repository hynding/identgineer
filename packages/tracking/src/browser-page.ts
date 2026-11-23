import type { NavigatorSignals, PageEnvironment, Unsubscribe } from "./page-environment.ts";

type HistoryMethod = (...args: unknown[]) => unknown;

interface HistoryMethods {
  pushState: HistoryMethod;
  replaceState: HistoryMethod;
}

interface NavigatorLike {
  readonly onLine?: unknown;
  readonly globalPrivacyControl?: unknown;
  readonly doNotTrack?: unknown;
  readonly msDoNotTrack?: unknown;
}

const NOTHING: Unsubscribe = () => undefined;

const read = <T>(get: () => T): T | undefined => {
  try {
    return get();
  } catch {
    return undefined;
  }
};

const listenOnWindow = (type: string, listener: () => void): Unsubscribe => {
  const { addEventListener, removeEventListener } = globalThis as unknown as Partial<Window>;
  if (typeof addEventListener !== "function" || typeof removeEventListener !== "function") {
    return NOTHING;
  }
  const handler = (): void => {
    listener();
  };
  addEventListener.call(globalThis, type, handler);
  return () => {
    removeEventListener.call(globalThis, type, handler);
  };
};

const listenOnDocument = (type: string, listener: () => void): Unsubscribe => {
  const target = read(() => globalThis.document) as Partial<Document> | undefined;
  if (typeof target?.addEventListener !== "function") return NOTHING;
  const handler = (): void => {
    listener();
  };
  target.addEventListener(type, handler);
  return () => {
    target.removeEventListener?.(type, handler);
  };
};

const hidden = (listener: () => void): Unsubscribe => {
  const stopVisibility = listenOnDocument("visibilitychange", () => {
    if (read(() => globalThis.document.visibilityState) === "hidden") listener();
  });
  const stopPageHide = listenOnWindow("pagehide", listener);
  return () => {
    stopVisibility();
    stopPageHide();
  };
};

// A wrapper reports after the original ran. On stopping, it restores the original only when no one
// wrapped it since; otherwise it just goes quiet, so another script's wrapper is never undone.
const watchHistory = (listener: () => void): Unsubscribe => {
  const history = read(() => globalThis.history) as unknown as HistoryMethods | undefined;
  if (typeof history?.pushState !== "function" || typeof history.replaceState !== "function") {
    return NOTHING;
  }
  let active = true;
  const notify = (): void => {
    if (!active) return;
    try {
      listener();
    } catch {
      // A page's listener must never break the page's own navigation.
    }
  };
  const wrap = (original: HistoryMethod): HistoryMethod =>
    function (this: unknown, ...args) {
      const result = Reflect.apply<unknown, unknown[], unknown>(original, this, args);
      notify();
      return result;
    };
  const original = { pushState: history.pushState, replaceState: history.replaceState };
  const wrapped = {
    pushState: wrap(original.pushState),
    replaceState: wrap(original.replaceState),
  };
  history.pushState = wrapped.pushState;
  history.replaceState = wrapped.replaceState;
  const stopPopState = listenOnWindow("popstate", notify);
  return () => {
    if (!active) return;
    active = false;
    stopPopState();
    if (history.pushState === wrapped.pushState) history.pushState = original.pushState;
    if (history.replaceState === wrapped.replaceState) history.replaceState = original.replaceState;
  };
};

const signals = (): NavigatorSignals => {
  const navigator = read(() => globalThis.navigator) as NavigatorLike | undefined;
  if (navigator === undefined) return {};
  const windowValue = read(() => (globalThis as { doNotTrack?: unknown }).doNotTrack);
  const dnt = [navigator.doNotTrack, windowValue, navigator.msDoNotTrack].includes("1")
    ? "1"
    : navigator.doNotTrack;
  return {
    ...(navigator.globalPrivacyControl === undefined
      ? {}
      : { globalPrivacyControl: navigator.globalPrivacyControl }),
    ...(dnt === undefined ? {} : { doNotTrack: dnt }),
    ...(typeof navigator.onLine === "boolean" ? { onLine: navigator.onLine } : {}),
  };
};

/**
 * The real page. It touches nothing until a listener subscribes, and where there is no DOM (server
 * rendering) every read is empty and every subscription does nothing.
 */
export const createBrowserPage = (): PageEnvironment => ({
  location: () => read(() => globalThis.location.href),
  referrer: () => read(() => globalThis.document.referrer) ?? "",
  signals,
  onHidden: hidden,
  onOnline: (listener) => listenOnWindow("online", listener),
  onNavigate: watchHistory,
});
