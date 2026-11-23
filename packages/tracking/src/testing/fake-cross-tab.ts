import type { CrossTab } from "../cross-tab.ts";

export interface CrossTabHubOptions {
  /** Hold posts back until `deliver()`, as the asynchronous BroadcastChannel does. */
  readonly manual?: boolean;
}

/** One channel several tabs share: a post reaches every tab but the poster's. */
export interface CrossTabHub {
  readonly connect: () => CrossTab;
  readonly deliver: () => void;
  readonly listenerCount: () => number;
}

type Listener = (message: unknown) => void;

export const createCrossTabHub = (options: CrossTabHubOptions = {}): CrossTabHub => {
  const tabs: Set<Listener>[] = [];
  let pending: { from: Set<Listener>; message: unknown }[] = [];

  const send = (from: Set<Listener>, message: unknown): void => {
    for (const tab of tabs) {
      if (tab !== from) for (const listener of [...tab]) listener(message);
    }
  };

  return {
    connect: () => {
      const mine = new Set<Listener>();
      tabs.push(mine);
      return {
        post: (message) => {
          if (options.manual === true) pending.push({ from: mine, message });
          else send(mine, message);
        },
        subscribe: (listener) => {
          mine.add(listener);
          return () => {
            mine.delete(listener);
          };
        },
      };
    },
    deliver: () => {
      const queue = pending;
      pending = [];
      for (const { from, message } of queue) send(from, message);
    },
    listenerCount: () => tabs.reduce((sum, tab) => sum + tab.size, 0),
  };
};
