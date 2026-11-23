import type { ConsentStatusView } from "../consent/consent-types";

type Method = "get" | "grant" | "deny" | "reset" | "onChange" | "decidedAt";

/**
 * A hand-written consent object for the unit tests: it holds a status the test sets, records what
 * the component called, and can be told to throw from, or refuse, any method.
 */
export function createFakeConsent(initial: ConsentStatusView = { state: "unknown" }) {
  let status = initial;
  let decided: number | undefined;
  const listeners = new Set<(next: ConsentStatusView) => void>();
  const throwing = new Set<Method>();
  const calls: string[] = [];
  let storable = true;

  const guard = (method: Method) => {
    calls.push(method);
    if (throwing.has(method)) throw new Error(`${method} failed`);
  };
  const tell = () => {
    for (const listener of [...listeners]) listener(status);
  };
  const decide = (state: "granted" | "denied" | "unknown") => {
    if (!storable) return false;
    status = { state };
    tell();
    return true;
  };

  return {
    consent: {
      get: () => {
        guard("get");
        return status;
      },
      grant: () => {
        guard("grant");
        return status.reason === undefined && decide("granted");
      },
      deny: () => {
        guard("deny");
        return decide("denied");
      },
      reset: () => {
        guard("reset");
        return decide("unknown");
      },
      onChange: (listener: (next: ConsentStatusView) => void) => {
        guard("onChange");
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      decidedAt: () => {
        guard("decidedAt");
        return decided;
      },
    },
    calls,
    /** Changes the status as another tab or another component would, and tells the listeners. */
    set(next: ConsentStatusView) {
      status = next;
      tell();
    },
    /** Changes the status without telling anyone, as a change in storage nobody heard of. */
    setQuietly(next: ConsentStatusView) {
      status = next;
    },
    setDecidedAt(value: number | undefined) {
      decided = value;
    },
    /** From now on `method` throws. */
    throwFrom(method: Method) {
      throwing.add(method);
    },
    /** From now on a decision cannot be stored: grant, deny and reset return false. */
    refuseToStore() {
      storable = false;
    },
    listenerCount: () => listeners.size,
  };
}

export type FakeConsent = ReturnType<typeof createFakeConsent>;
