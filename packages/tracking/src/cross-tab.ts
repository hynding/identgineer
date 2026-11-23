import type { Unsubscribe } from "./page-environment.ts";

export const CONSENT_CHANGED = "consent-changed";

/** A channel to the page's other tabs. It carries the fact that consent changed, never a value. */
export interface CrossTab {
  readonly post: (message: unknown) => void;
  readonly subscribe: (listener: (message: unknown) => void) => Unsubscribe;
}

export const isConsentNotice = (message: unknown): boolean =>
  typeof message === "object" &&
  message !== null &&
  Object.keys(message).length === 1 &&
  (message as { type?: unknown }).type === CONSENT_CHANGED;

const CHANNEL_NAME = "identgineer-tracking";

/** A BroadcastChannel, opened when the first listener subscribes; none where it does not exist. */
export const createBroadcastCrossTab = (): CrossTab | undefined => {
  if (typeof globalThis.BroadcastChannel !== "function") return undefined;
  return {
    post: (message) => {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    },
    subscribe: (listener) => {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent) => {
        listener(event.data);
      };
      return () => {
        channel.onmessage = null;
        channel.close();
      };
    },
  };
};
