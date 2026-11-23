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
  { name: "a Cyrillic e in ember", value: "\u0435mber" },
  { name: "a fullwidth e in ember", value: "\uff45mber" },
  { name: "a combining accent on ember", value: "embe\u0072\u0301" },
  { name: "a decomposed accent after e", value: "e\u0301mber" },
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

export interface SearchVector {
  readonly name: string;
  readonly search: string;
}

/** Whole query strings, for what a single value cannot express: repetition and escaped names. */
export const SEARCHES: readonly SearchVector[] = [
  { name: "a doubled question mark", search: "??idg-theme=ember" },
  { name: "a repeated parameter, valid first", search: "?idg-theme=ember&idg-theme=tidal" },
  { name: "a repeated parameter, invalid first", search: "?idg-theme=nope&idg-theme=tidal" },
  { name: "a repeated parameter, empty first", search: "?idg-theme=&idg-theme=tidal" },
  { name: "a percent-encoded name", search: "?idg%2Dtheme=ember" },
  { name: "a lower-case percent-encoded name", search: "?idg%2dtheme=ember&idg%2Dux=focus" },
  { name: "a plus in the name", search: "?idg+theme=ember" },
  { name: "an encoded name and a plain one", search: "?idg%2Dtheme=ember&idg-theme=tidal" },
  { name: "a plain name and an encoded one", search: "?idg-theme=tidal&idg%2Dtheme=ember" },
  { name: "an upper-case name", search: "?IDG-THEME=ember" },
  { name: "a name with a suffix", search: "?idg-themes=ember" },
  { name: "an encoded value", search: "?idg-theme=%65mber" },
  { name: "an encoded Cyrillic value", search: "?idg-theme=%D0%B5mber" },
  { name: "a value with a plus", search: "?idg-theme=+ember" },
  { name: "a semicolon separator", search: "?idg-theme=ember;idg-ux=focus" },
  { name: "no value", search: "?idg-theme" },
  { name: "an empty search", search: "" },
  { name: "a lone question mark", search: "?" },
  { name: "a question mark inside a value", search: "?a=?&idg-theme=ember" },
  { name: "several valid", search: "?idg-theme=ember&idg-design=glass&idg-scheme=system" },
];
