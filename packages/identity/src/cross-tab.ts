export const SIGNED_OUT_MESSAGE = Object.freeze({ type: "signed-out" });

export interface CrossTab {
  readonly announceSignedOut: () => void;
  readonly close: () => void;
}

const isSignedOutNotice = (data: unknown): boolean =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  Object.keys(data).length === 1 &&
  (data as { type?: unknown }).type === "signed-out";

/**
 * Tells the page's other tabs that the user signed out, and hears them do the same. The notice
 * carries no token or user: each tab drops its own. Without BroadcastChannel it does nothing.
 */
export const createCrossTab = (name: string, onSignedOut: () => void): CrossTab => {
  if (typeof globalThis.BroadcastChannel !== "function") {
    return { announceSignedOut: () => undefined, close: () => undefined };
  }
  const channel = new BroadcastChannel(name);
  channel.onmessage = (event: MessageEvent) => {
    if (isSignedOutNotice(event.data)) onSignedOut();
  };
  return {
    announceSignedOut: () => {
      channel.postMessage(SIGNED_OUT_MESSAGE);
    },
    close: () => {
      channel.close();
    },
  };
};
