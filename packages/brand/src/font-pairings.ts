/**
 * Heading and body pairings built only from fonts that ship with common operating systems, each
 * stack ending in a generic family. Nothing is ever fetched, and a brand kit can only name one of
 * these ids, never a font-family string of its own.
 */
export interface FontPairing {
  readonly id: string;
  readonly label: string;
  readonly display: readonly string[];
  readonly body: readonly string[];
  readonly mono: readonly string[];
  readonly displayWeight: number;
  readonly displayLetterSpacing: string;
  readonly displayLineHeight: number;
  readonly bodyLetterSpacing: string;
  readonly bodyLineHeight: number;
}

const SYSTEM_SANS = ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"];
const GEOMETRIC = ["Avenir Next", "Avenir", "Century Gothic", "Futura", "Segoe UI", "system-ui"];
const HUMANIST = ["Seravek", "Gill Sans Nova", "Gill Sans", "Trebuchet MS", "Candara", "Segoe UI"];
const GROTESQUE = ["Helvetica Neue", "Helvetica", "Arial", "Liberation Sans", "sans-serif"];
const OLD_STYLE = ["Iowan Old Style", "Palatino Linotype", "Palatino", "Book Antiqua", "Georgia"];
const BOOK = ["Charter", "Bitstream Charter", "Sitka Text", "Cambria", "Georgia", "serif"];
const MONO = [
  "ui-monospace",
  "SF Mono",
  "Cascadia Code",
  "Menlo",
  "Consolas",
  "DejaVu Sans Mono",
  "Liberation Mono",
  "monospace",
];

function pairing(fields: FontPairing): FontPairing {
  return Object.freeze({
    ...fields,
    display: Object.freeze([...fields.display]),
    body: Object.freeze([...fields.body]),
    mono: Object.freeze([...fields.mono]),
  });
}

export const FONT_PAIRINGS = Object.freeze([
  pairing({
    id: "system",
    label: "System sans",
    display: SYSTEM_SANS,
    body: SYSTEM_SANS,
    mono: MONO,
    displayWeight: 700,
    displayLetterSpacing: "-0.015em",
    displayLineHeight: 1.2,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.5,
  }),
  pairing({
    id: "geometric",
    label: "Geometric sans over system sans",
    display: [...GEOMETRIC, "sans-serif"],
    body: SYSTEM_SANS,
    mono: MONO,
    displayWeight: 600,
    displayLetterSpacing: "-0.02em",
    displayLineHeight: 1.15,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.6,
  }),
  pairing({
    id: "humanist",
    label: "Humanist sans",
    display: [...HUMANIST, "system-ui", "sans-serif"],
    body: [...HUMANIST, "system-ui", "sans-serif"],
    mono: MONO,
    displayWeight: 600,
    displayLetterSpacing: "-0.01em",
    displayLineHeight: 1.2,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.6,
  }),
  pairing({
    id: "grotesque",
    label: "Grotesque sans",
    display: GROTESQUE,
    body: GROTESQUE,
    mono: MONO,
    displayWeight: 700,
    displayLetterSpacing: "-0.03em",
    displayLineHeight: 1.1,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.5,
  }),
  pairing({
    id: "classic-serif",
    label: "Old-style serif over system sans",
    display: [...OLD_STYLE, "serif"],
    body: SYSTEM_SANS,
    mono: MONO,
    displayWeight: 600,
    displayLetterSpacing: "0em",
    displayLineHeight: 1.2,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.6,
  }),
  pairing({
    id: "book",
    label: "Book serif",
    display: BOOK,
    body: BOOK,
    mono: MONO,
    displayWeight: 700,
    displayLetterSpacing: "-0.01em",
    displayLineHeight: 1.2,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.7,
  }),
  pairing({
    id: "technical",
    label: "Monospace over grotesque sans",
    display: MONO,
    body: GROTESQUE,
    mono: MONO,
    displayWeight: 600,
    displayLetterSpacing: "-0.02em",
    displayLineHeight: 1.2,
    bodyLetterSpacing: "0em",
    bodyLineHeight: 1.5,
  }),
] as const);

export const TYPOGRAPHY_IDS = [
  "system",
  "geometric",
  "humanist",
  "grotesque",
  "classic-serif",
  "book",
  "technical",
] as const;

export type TypographyId = (typeof TYPOGRAPHY_IDS)[number];

export function fontPairingFor(id: TypographyId): FontPairing {
  const found = FONT_PAIRINGS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no font pairing "${id}"`);
  return found;
}
