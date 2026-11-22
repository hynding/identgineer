export type CrossTabNotice = "signed-out" | "signed-in";

export interface CrossTabHandlers {
  readonly onSignedOut: () => void;
  readonly onSignedIn: () => void;
}

export interface CrossTab {
  readonly announce: (notice: CrossTabNotice) => void;
  readonly close: () => void;
}

const noticeOf = (data: unknown): CrossTabNotice | undefined => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  if (Object.keys(data).length !== 1) return undefined;
  const type = (data as { type?: unknown }).type;
  return type === "signed-out" || type === "signed-in" ? type : undefined;
};

/**
 * Tells the page's other tabs that the user signed out or in, and hears them do the same. A
 * notice carries no token and no user: each tab drops its own tokens, or checks the shared
 * refresh cookie for itself. Without BroadcastChannel it does nothing.
 */
export const createCrossTab = (name: string, handlers: CrossTabHandlers): CrossTab => {
  if (typeof globalThis.BroadcastChannel !== "function") {
    return { announce: () => undefined, close: () => undefined };
  }
  const channel = new BroadcastChannel(name);
  let closed = false;
  channel.onmessage = (event: MessageEvent) => {
    const notice = noticeOf(event.data);
    if (notice === "signed-out") handlers.onSignedOut();
    if (notice === "signed-in") handlers.onSignedIn();
  };
  return {
    announce: (notice) => {
      if (!closed) channel.postMessage({ type: notice });
    },
    close: () => {
      closed = true;
      channel.close();
    },
  };
};
