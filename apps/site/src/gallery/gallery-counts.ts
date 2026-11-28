import { AXES, REGISTRY, type VariationsRegistry } from "@identgineer/variations";

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

const NOUNS = {
  theme: ["theme", "themes"],
  design: ["design", "designs"],
  layout: ["layout", "layouts"],
  ux: ["UX mode", "UX modes"],
} as const;

function counted(count: number, noun: readonly [string, string]): string {
  const word = WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? noun[0] : noun[1]}`;
}

/**
 * "Eight themes, eight designs, eight layouts and eight UX modes", counted from the registries, so
 * the words that describe the gallery stay true when a package adds or drops a value.
 */
export function countsLine(registry: VariationsRegistry = REGISTRY): string {
  const parts = AXES.map((axis) => counted(registry[axis].variations.length, NOUNS[axis]));
  const line = `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}
