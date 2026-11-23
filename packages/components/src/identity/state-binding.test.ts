import { describe, expect, it, vi } from "vitest";
import type { IdentityStateView, StateSource } from "./identity-types";
import { StateBinding } from "./state-binding";

function source(initial: IdentityStateView) {
  let state = initial;
  const listeners = new Set<(next: IdentityStateView) => void>();
  return {
    getState: () => state,
    subscribe: vi.fn((listener: (next: IdentityStateView) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit(next: IdentityStateView) {
      state = next;
      for (const listener of listeners) listener(next);
    },
    listeners,
  };
}

const UNKNOWN: IdentityStateView = { status: "unknown" };
const SIGNED_OUT: IdentityStateView = { status: "signed-out", reason: "user" };

describe("StateBinding", () => {
  it("reports the current state on bind and every change after it", () => {
    const client = source(UNKNOWN);
    const seen: IdentityStateView[] = [];
    const binding = new StateBinding<StateSource>((state) => seen.push(state));
    binding.bind(client);
    client.emit(SIGNED_OUT);
    expect(seen).toEqual([UNKNOWN, SIGNED_OUT]);
  });

  it("subscribes once for the same client and moves to a new one", () => {
    const first = source(UNKNOWN);
    const second = source(SIGNED_OUT);
    const seen: IdentityStateView[] = [];
    const binding = new StateBinding<StateSource>((state) => seen.push(state));
    binding.bind(first);
    binding.bind(first);
    expect(first.subscribe).toHaveBeenCalledTimes(1);
    binding.bind(second);
    expect(first.listeners.size).toBe(0);
    first.emit(SIGNED_OUT);
    expect(seen).toEqual([UNKNOWN, SIGNED_OUT]);
    expect(binding.current()).toBe(second);
  });

  it("lets go of the client on unbind and on an empty bind", () => {
    const client = source(UNKNOWN);
    const binding = new StateBinding<StateSource>(() => undefined);
    binding.bind(client);
    binding.unbind();
    expect(client.listeners.size).toBe(0);
    expect(binding.current()).toBeUndefined();
    binding.bind(client);
    binding.bind(undefined);
    expect(client.listeners.size).toBe(0);
  });

  it("ignores a value that is not a client, as JavaScript may set", () => {
    const seen: unknown[] = [];
    const binding = new StateBinding<StateSource>((state) => seen.push(state));
    binding.bind({ getState: 1 } as unknown as StateSource);
    expect(seen).toEqual([]);
    expect(binding.current()).toBeUndefined();
  });

  it("treats a client whose subscribe throws (a disposed one) as no client", () => {
    const binding = new StateBinding<StateSource>(() => undefined);
    binding.bind({
      getState: () => UNKNOWN,
      subscribe: () => {
        throw new Error("disposed");
      },
    });
    expect(binding.current()).toBeUndefined();
  });
});
