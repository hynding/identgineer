import { describe, expect, it } from "vitest";
import { parseEventDeclarations } from "./event-declarations.ts";

describe("parseEventDeclarations", () => {
  it("reads every event and its property types", () => {
    const declared = parseEventDeclarations({
      signup_completed: { properties: { plan: "string", seats: "number", trial: "boolean" } },
      logout: { properties: {} },
    });
    expect([...declared.keys()]).toEqual(["signup_completed", "logout"]);
    expect(declared.get("signup_completed")?.get("seats")).toBe("number");
    expect(declared.get("logout")?.size).toBe(0);
  });

  it("accepts no events at all", () => {
    expect(parseEventDeclarations({}).size).toBe(0);
  });

  it("copies, so later changes to the options change nothing", () => {
    const events = { a: { properties: { b: "string" as const } } };
    const declared = parseEventDeclarations(events);
    events.a.properties.b = "string";
    delete (events as { a?: unknown }).a;
    expect(declared.has("a")).toBe(true);
  });

  it.each([
    ["events that are not an object", null, /options\.events/],
    ["an array of events", [], /options\.events/],
    ["an upper-case event name", { Signup: { properties: {} } }, /"Signup"/],
    ["an event name with a dash", { "sign-up": { properties: {} } }, /"sign-up"/],
    [
      "an event name over 64 characters",
      { [`a${"b".repeat(64)}`]: { properties: {} } },
      /event name/,
    ],
    ["a declaration that is not an object", { a: "x" }, /"a"/],
    ["a declaration without properties", { a: {} }, /"a".*properties/],
    ["properties that are an array", { a: { properties: [] } }, /"a".*properties/],
    ["a property key in upper case", { a: { properties: { Plan: "string" } } }, /"a".*"Plan"/],
    [
      "a property type that does not exist",
      { a: { properties: { p: "date" } } },
      /"a".*"p".*"date"/,
    ],
    [
      "more than 32 properties",
      {
        a: {
          properties: Object.fromEntries(
            Array.from({ length: 33 }, (_v, i) => [`p${String(i)}`, "string"]),
          ),
        },
      },
      /"a".*32/,
    ],
    ["the built-in page view name", { page_view: { properties: {} } }, /page_view/],
    [
      "an own __proto__ name",
      JSON.parse('{"__proto__":{"properties":{}}}') as unknown,
      /__proto__/,
    ],
  ])("throws a located TypeError for %s", (_label, events, message) => {
    expect(() => parseEventDeclarations(events)).toThrow(TypeError);
    expect(() => parseEventDeclarations(events)).toThrow(message);
  });
});
