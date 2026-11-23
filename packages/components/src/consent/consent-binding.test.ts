import { describe, expect, it, vi } from "vitest";
import { createFakeConsent } from "../testing/fake-consent";
import { ConsentBinding } from "./consent-binding";

function bound() {
  const seen: string[] = [];
  const failures: string[] = [];
  const binding = new ConsentBinding(
    (status) =>
      seen.push(status.reason === undefined ? status.state : `${status.state}:${status.reason}`),
    (failure) => failures.push(failure),
  );
  return { binding, seen, failures };
}

describe("ConsentBinding", () => {
  it("reports nothing and calls nothing without a consent object", () => {
    const { binding, seen, failures } = bound();
    binding.bind(undefined);
    expect(seen).toEqual([]);
    expect(failures).toEqual([]);
    expect(binding.current()).toBeUndefined();
  });

  it("reports the current status, then every change, and stops on unbind", () => {
    const fake = createFakeConsent();
    const { binding, seen } = bound();
    binding.bind(fake.consent);
    fake.set({ state: "granted" });
    fake.set({ state: "denied", reason: "gpc" });
    expect(seen).toEqual(["unknown", "granted", "denied:gpc"]);
    binding.unbind();
    expect(fake.listenerCount()).toBe(0);
    fake.set({ state: "unknown" });
    expect(seen).toHaveLength(3);
  });

  it("binds the same object once, and swaps to another, letting the first go", () => {
    const first = createFakeConsent();
    const second = createFakeConsent({ state: "granted" });
    const { binding, seen } = bound();
    binding.bind(first.consent);
    binding.bind(first.consent);
    expect(first.listenerCount()).toBe(1);
    binding.bind(second.consent);
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);
    expect(seen).toEqual(["unknown", "granted"]);
  });

  it("ignores a value that is not a consent object, as a property set from JavaScript may be", () => {
    const { binding, seen, failures } = bound();
    binding.bind({ get: () => ({ state: "unknown" }) } as never);
    binding.bind("consent" as never);
    expect(seen).toEqual([]);
    expect(failures).toEqual([]);
    expect(binding.current()).toBeUndefined();
  });

  it("reports a get() that throws, or answers with something else, as a failure, never as a throw", () => {
    const fake = createFakeConsent();
    fake.throwFrom("get");
    const { binding, seen, failures } = bound();
    expect(() => binding.bind(fake.consent)).not.toThrow();
    expect(seen).toEqual([]);
    expect(failures).toEqual(["read"]);
    const odd = { ...createFakeConsent().consent, get: () => ({ state: "maybe" }) };
    binding.bind(odd as never);
    expect(failures).toEqual(["read", "read"]);
  });

  it("goes on without live updates when onChange throws", () => {
    const fake = createFakeConsent({ state: "denied", reason: "dnt" });
    fake.throwFrom("onChange");
    const { binding, seen, failures } = bound();
    expect(() => binding.bind(fake.consent)).not.toThrow();
    expect(seen).toEqual(["denied:dnt"]);
    expect(failures).toEqual([]);
  });

  it("reports a failure when a change arrives that is not a status", () => {
    const fake = createFakeConsent();
    const { binding, seen, failures } = bound();
    binding.bind(fake.consent);
    fake.set({ state: "elsewhere" } as never);
    expect(seen).toEqual(["unknown"]);
    expect(failures).toEqual(["read"]);
  });

  it("reads afresh on demand, and says so when it cannot", () => {
    const fake = createFakeConsent();
    const { binding, seen, failures } = bound();
    binding.bind(fake.consent);
    fake.setQuietly({ state: "granted" });
    binding.refresh();
    expect(seen).toEqual(["unknown", "granted"]);
    fake.throwFrom("get");
    binding.refresh();
    expect(failures).toEqual(["read"]);
  });

  it("calls the unsubscribe it was given exactly once", () => {
    const unsubscribe = vi.fn();
    const consent = {
      ...createFakeConsent().consent,
      onChange: () => unsubscribe,
    };
    const { binding } = bound();
    binding.bind(consent);
    binding.unbind();
    binding.unbind();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("survives an unsubscribe that throws", () => {
    const consent = {
      ...createFakeConsent().consent,
      onChange: () => () => {
        throw new Error("gone");
      },
    };
    const { binding } = bound();
    binding.bind(consent);
    expect(() => binding.unbind()).not.toThrow();
    expect(binding.current()).toBeUndefined();
  });
});
