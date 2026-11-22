/** Subscribes to the browser coming back online; returns the function that stops listening. */
export type OnlineSubscription = (listener: () => void) => () => void;

interface OnlineEvents {
  addEventListener?: (type: "online", listener: () => void) => void;
  removeEventListener?: (type: "online", listener: () => void) => void;
}

/**
 * The given subscription, or the window's `online` event when the option is left out; `null`
 * turns it off (a refresh that could not reach the server then waits for its next retry).
 */
export const resolveOnline = (
  option: OnlineSubscription | null | undefined,
): OnlineSubscription | null => {
  if (option !== undefined) return option;
  const events = globalThis as OnlineEvents;
  const { addEventListener, removeEventListener } = events;
  if (typeof addEventListener !== "function" || typeof removeEventListener !== "function") {
    return null;
  }
  return (listener) => {
    addEventListener.call(events, "online", listener);
    return () => {
      removeEventListener.call(events, "online", listener);
    };
  };
};
