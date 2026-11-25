import { describe, expect, it } from "vitest";
import { ownValue } from "./own-value";

describe("ownValue", () => {
  it("reads an own property, whatever it holds", () => {
    expect(ownValue({ a: 1 }, "a")).toBe(1);
    expect(ownValue({ a: null }, "a")).toBeNull();
    expect(ownValue(["x"], "0")).toBe("x");
  });

  it("does not read through the prototype", () => {
    expect(ownValue(Object.create({ a: 1 }), "a")).toBeUndefined();
    expect(ownValue({}, "constructor")).toBeUndefined();
    expect(ownValue({}, "__proto__")).toBeUndefined();
  });

  it("reads nothing from what is not an object", () => {
    for (const source of [undefined, null, "abc", 3, true, Symbol("s")]) {
      expect(ownValue(source, "length")).toBeUndefined();
    }
  });

  it("reads nothing when a getter or a proxy throws", () => {
    const getter = {
      get a(): never {
        throw new Error("no");
      },
    };
    const { proxy, revoke } = Proxy.revocable({ a: 1 }, {});
    revoke();
    expect(ownValue(getter, "a")).toBeUndefined();
    expect(ownValue(proxy, "a")).toBeUndefined();
  });
});
