import { describe, expect, it } from "vitest";
import { readComponentDocs, REFERENCE_LIMITS } from "./component-docs.ts";

/** The parts of the components package's `docs.json` the site reads, for one component. */
function component(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag: "idg-sample",
    docs: "A sample.\n\nIt has two paragraphs.",
    docsTags: [],
    props: [
      {
        name: "tone",
        type: '"calm" | "loud"',
        attr: "tone",
        docs: "How it sounds.",
        default: '"calm"',
        optional: false,
      },
      { name: "payload", type: "Payload | undefined", docs: "", optional: true },
    ],
    events: [
      {
        event: "idgPick",
        detail: "PickDetail",
        cancelable: true,
        bubbles: true,
        composed: true,
        docs: "Fires when picked.",
      },
    ],
    methods: [
      {
        name: "setFocus",
        signature: "setFocus() => Promise<void>",
        returns: { type: "Promise<void>", docs: "" },
        docs: "Focuses it.",
      },
    ],
    slots: [
      { name: "", docs: "The label." },
      { name: "start", docs: "Before the label." },
    ],
    parts: [{ name: "control", docs: "The native control." }],
    styles: [{ name: "--idg-sample-gap", docs: "The gap.", annotation: "prop" }],
    ...overrides,
  };
}

const docs = (...components: Record<string, unknown>[]) => ({ components });

describe("reading the components package's docs.json", () => {
  it("makes one record of everything a component documents", () => {
    expect(readComponentDocs(docs(component()))).toEqual([
      {
        tag: "idg-sample",
        summary: ["A sample.", "It has two paragraphs."],
        properties: [
          {
            name: "tone",
            attribute: "tone",
            type: '"calm" | "loud"',
            default: '"calm"',
            description: "How it sounds.",
          },
          { name: "payload", type: "Payload | undefined", description: "" },
        ],
        events: [
          {
            name: "idgPick",
            detail: "PickDetail",
            cancelable: true,
            description: "Fires when picked.",
          },
        ],
        methods: [
          {
            signature: "setFocus() => Promise<void>",
            returns: "Promise<void>",
            description: "Focuses it.",
          },
        ],
        slots: [
          { name: "", description: "The label." },
          { name: "start", description: "Before the label." },
        ],
        parts: [{ name: "control", description: "The native control." }],
        cssProperties: [{ name: "--idg-sample-gap", description: "The gap." }],
      },
    ]);
  });

  it("keeps the order of the file, and holds a component with nothing documented", () => {
    const bare = {
      tag: "idg-bare",
      docs: "",
      props: [],
      events: [],
      methods: [],
      slots: [],
      parts: [],
      styles: [],
    };
    const records = readComponentDocs(docs(component(), bare));
    expect(records.map((record) => record.tag)).toEqual(["idg-sample", "idg-bare"]);
    expect(records[1]).toEqual({
      tag: "idg-bare",
      summary: [],
      properties: [],
      events: [],
      methods: [],
      slots: [],
      parts: [],
      cssProperties: [],
    });
  });

  it.each([
    ["no components list", {}, "components"],
    ["a component that is not an object", docs("idg-x" as never), "components[0]"],
    ["a tag that is not an idg- name", docs(component({ tag: "div" })), "components[0].tag"],
    ["a tag that could be a path", docs(component({ tag: "idg-a/../b" })), "components[0].tag"],
    ["the same tag twice", docs(component(), component()), "idg-sample"],
    ["a property without a name", docs(component({ props: [{ type: "x" }] })), "props[0].name"],
  ])("refuses %s, naming where", (_, input, where) => {
    expect(() => readComponentDocs(input)).toThrow(where);
  });
});

describe("text in docs.json, which is only ever text", () => {
  it("keeps markup as it is written: it is drawn as text, never read as HTML", () => {
    const markup = '<img src=x onerror="alert(1)"> and <script>x()</script> &amp;';
    const [record] = readComponentDocs(docs(component({ docs: markup })));
    expect(record?.summary).toEqual([markup]);
  });

  it("removes control and direction-changing characters, and turns line breaks into spaces", () => {
    const hostile = "a\u0000b‮c⁦d​e؜f﻿g\u0085h\ni\tj k\ud800";
    const [record] = readComponentDocs(
      docs(
        component({
          docs: hostile,
          props: [
            { name: `n${hostile}`, type: hostile, docs: hostile, default: hostile, attr: hostile },
          ],
        }),
      ),
    );
    const expected = "abcdefgh i j k";
    expect(record?.summary).toEqual([expected]);
    expect(record?.properties).toEqual([
      {
        name: `n${expected}`,
        attribute: expected,
        type: expected,
        default: expected,
        description: expected,
      },
    ]);
  });

  it("clips a very long unbroken name, type, default and description, ending with an ellipsis", () => {
    const long = "x".repeat(10_000);
    const [record] = readComponentDocs(
      docs(
        component({
          docs: long,
          props: [{ name: long, attr: long, type: long, default: long, docs: long }],
          events: [{ event: long, detail: long, docs: long }],
          methods: [{ name: "m", signature: long, returns: { type: long }, docs: long }],
          slots: [{ name: long, docs: long }],
          parts: [{ name: long, docs: long }],
          styles: [{ name: long, docs: long }],
        }),
      ),
    );
    const { name, text } = REFERENCE_LIMITS;
    const clipped = (limit: number) => `${"x".repeat(limit - 1)}…`;
    expect(record?.summary).toEqual([clipped(text)]);
    expect(record?.properties[0]).toEqual({
      name: clipped(name),
      attribute: clipped(name),
      type: clipped(text),
      default: clipped(text),
      description: clipped(text),
    });
    expect(record?.events[0]).toMatchObject({ name: clipped(name), detail: clipped(text) });
    expect(record?.methods[0]).toMatchObject({ signature: clipped(text), returns: clipped(text) });
    expect(record?.slots[0]?.name).toBe(clipped(name));
    expect(record?.parts[0]?.name).toBe(clipped(name));
    expect(record?.cssProperties[0]?.name).toBe(clipped(name));
  });

  it("does not cut a character in two when it clips", () => {
    const emoji = "😀".repeat(REFERENCE_LIMITS.name);
    const [record] = readComponentDocs(
      docs(component({ props: [{ name: emoji, type: "x", docs: "" }] })),
    );
    const name = record?.properties[0]?.name ?? "";
    expect(name.endsWith("…")).toBe(true);
    expect(name).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(name.length).toBeLessThanOrEqual(REFERENCE_LIMITS.name);
  });

  it("splits a summary into at most a few paragraphs", () => {
    const many = Array.from({ length: 40 }, (_, index) => `Paragraph ${String(index)}.`).join(
      "\n\n",
    );
    const [record] = readComponentDocs(docs(component({ docs: many })));
    expect(record?.summary).toHaveLength(REFERENCE_LIMITS.paragraphs);
    expect(record?.summary[0]).toBe("Paragraph 0.");
  });
});
