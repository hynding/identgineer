import { describe, expect, it } from "vitest";
import { parseConsentRecord, serialiseConsentRecord } from "./consent-record.ts";

describe("consent record", () => {
  it("is written as one small JSON object", () => {
    expect(serialiseConsentRecord({ state: "granted", version: 3, decidedAt: 1_700_000_000_000 })).toBe(
      '{"state":"granted","version":3,"decidedAt":1700000000000}',
    );
  });

  it.each(["granted", "denied"] as const)("reads back a %s record of the current version", (state) => {
    const text = serialiseConsentRecord({ state, version: 2, decidedAt: 5 });
    expect(parseConsentRecord(text, 2)).toEqual({ state, version: 2, decidedAt: 5 });
  });

  it("counts a record of another version as none", () => {
    const text = serialiseConsentRecord({ state: "granted", version: 1, decidedAt: 5 });
    expect(parseConsentRecord(text, 2)).toBeUndefined();
    expect(parseConsentRecord(text, 0)).toBeUndefined();
  });

  it.each([
    ["not JSON", "{"],
    ["empty", ""],
    ["a string", '"granted"'],
    ["null", "null"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["state unknown", '{"state":"unknown","version":1,"decidedAt":5}'],
    ["state in capitals", '{"state":"GRANTED","version":1,"decidedAt":5}'],
    ["a state that is not text", '{"state":true,"version":1,"decidedAt":5}'],
    ["a version as text", '{"state":"granted","version":"1","decidedAt":5}'],
    ["a fractional version", '{"state":"granted","version":1.5,"decidedAt":5}'],
    ["no decision time", '{"state":"granted","version":1}'],
    ["a negative decision time", '{"state":"granted","version":1,"decidedAt":-1}'],
    ["a decision time as text", '{"state":"granted","version":1,"decidedAt":"5"}'],
    ["a decision time beyond the Date range", '{"state":"granted","version":1,"decidedAt":9e15}'],
    ["an extra key", '{"state":"granted","version":1,"decidedAt":5,"extra":1}'],
    ["an own __proto__ key", '{"state":"granted","version":1,"decidedAt":5,"__proto__":{"x":1}}'],
    ["a huge value", `{"state":"granted","version":1,"decidedAt":5,"pad":"${"x".repeat(1000)}"}`],
  ])("counts %s as none", (_label, text) => {
    expect(parseConsentRecord(text, 1)).toBeUndefined();
  });

  it("pollutes nothing while reading a hostile record", () => {
    parseConsentRecord('{"__proto__":{"polluted":true},"state":"granted","version":1,"decidedAt":5}', 1);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
