import { REGISTRY, STATE_KEYS } from "./registry.ts";

export interface Vector {
  readonly name: string;
  readonly value: unknown;
}

const ALL_IDS: readonly string[] = STATE_KEYS.flatMap((key) =>
  key === "scheme" ? [...REGISTRY.scheme.ids] : REGISTRY[key].variations.map(({ id }) => id),
);

/** One table for every reader of untrusted text, so they are held to the same answers. */
export const VECTORS: readonly Vector[] = [
  ...ALL_IDS.map((id) => ({ name: `the id ${id}`, value: id })),
  ...ALL_IDS.map((id) => ({ name: `${id} in upper case`, value: id.toUpperCase() })),
  ...ALL_IDS.slice(0, 12).flatMap((id) => [
    { name: `${id} with a leading space`, value: ` ${id}` },
    { name: `${id} with a trailing newline`, value: `${id}\n` },
    { name: `${id} with a NUL`, value: `${id}\0` },
    { name: `${id} with a suffix`, value: `${id}-x` },
    { name: `${id} with a zero-width space`, value: `${id}${String.fromCodePoint(0x200b)}` },
  ]),
  { name: "the empty string", value: "" },
  { name: "a space", value: " " },
  { name: "__proto__", value: "__proto__" },
  { name: "constructor", value: "constructor" },
  { name: "toString", value: "toString" },
  { name: "hasOwnProperty", value: "hasOwnProperty" },
  { name: "script markup", value: "<script>alert(1)</script>" },
  { name: "an attribute breakout", value: 'ember" onload="x' },
  { name: "a javascript URL", value: "javascript:alert(1)" },
  { name: "a comma list", value: "ember,tidal" },
  { name: "a very long string", value: "e".repeat(100_000) },
  { name: "a long string that starts with an id", value: `ember${"x".repeat(5_000)}` },
  { name: "a number", value: 42 },
  { name: "null", value: null },
  { name: "true", value: true },
  { name: "an object", value: { toString: "ember" } },
  { name: "an array holding an id", value: ["ember"] },
];
