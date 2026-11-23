export type Unsubscribe = () => void;

/** What the browser says about the visitor's wishes and connection; read at every use. */
export interface NavigatorSignals {
  /** `navigator.globalPrivacyControl`: honoured only when it is `true`. */
  readonly globalPrivacyControl?: unknown;
  /** `navigator.doNotTrack`: honoured only when it is `"1"`. */
  readonly doNotTrack?: unknown;
  /** `navigator.onLine`: `false` holds delivery until the `online` event. */
  readonly onLine?: unknown;
}

/** Everything the tracker reads from the page and listens to on it, so SSR and tests can stand in. */
export interface PageEnvironment {
  readonly location: () => string | undefined;
  readonly referrer: () => string;
  readonly signals: () => NavigatorSignals;
  /** The page became hidden or is being unloaded (`visibilitychange` to hidden, `pagehide`). */
  readonly onHidden: (listener: () => void) => Unsubscribe;
  readonly onOnline: (listener: () => void) => Unsubscribe;
  /** The URL changed without a load: `pushState`, `replaceState` or `popstate`. */
  readonly onNavigate: (listener: () => void) => Unsubscribe;
}
