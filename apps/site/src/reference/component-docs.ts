import { withoutForbiddenText } from "../content/validate-content-page.ts";
import { clip } from "./clip.ts";

/** The bounds the reference holds the components package's text to, as the content format needs. */
export const REFERENCE_LIMITS = {
  /** A name: a component's property, event, slot, part or custom property. */
  name: 200,
  /** A type, a default, a signature or a description: the longest run the content format takes. */
  text: 2_000,
  /** A summary is as many paragraphs as this, and no more. */
  paragraphs: 6,
} as const;

export interface PropertyDoc {
  readonly name: string;
  /** The attribute that sets it; none for a property that can only be set from a script. */
  readonly attribute?: string;
  readonly type: string;
  readonly default?: string;
  readonly description: string;
}

export interface EventDoc {
  readonly name: string;
  readonly detail: string;
  readonly cancelable: boolean;
  readonly description: string;
}

export interface MethodDoc {
  readonly signature: string;
  readonly returns: string;
  readonly description: string;
}

export interface SlotDoc {
  /** Empty for the default slot. */
  readonly name: string;
  readonly description: string;
}

export interface PartDoc {
  readonly name: string;
  readonly description: string;
}

export interface CssPropertyDoc {
  readonly name: string;
  readonly description: string;
}

/** Everything the components package documents about one component, as plain text. */
export interface ComponentDoc {
  readonly tag: string;
  readonly summary: readonly string[];
  readonly properties: readonly PropertyDoc[];
  readonly events: readonly EventDoc[];
  readonly methods: readonly MethodDoc[];
  readonly slots: readonly SlotDoc[];
  readonly parts: readonly PartDoc[];
  readonly cssProperties: readonly CssPropertyDoc[];
}

const TAG = /^idg-[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Source = Record<string, unknown>;

function isSource(value: unknown): value is Source {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plain(value: unknown, limit: number): string {
  return typeof value === "string" ? clip(withoutForbiddenText(value), limit) : "";
}

function list(value: unknown, where: string): Source[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${where} must be a list`);
  return value.map((entry, index) => {
    if (!isSource(entry)) throw new Error(`${where}[${String(index)}] must be an object`);
    return entry;
  });
}

function named(entry: Source, key: string, where: string): string {
  const name = plain(entry[key], REFERENCE_LIMITS.name);
  if (name === "") throw new Error(`${where}.${key} must be text`);
  return name;
}

function property(entry: Source, where: string): PropertyDoc {
  const attribute = plain(entry.attr, REFERENCE_LIMITS.name);
  const fallback = plain(entry.default, REFERENCE_LIMITS.text);
  return {
    name: named(entry, "name", where),
    ...(attribute === "" ? {} : { attribute }),
    type: plain(entry.type, REFERENCE_LIMITS.text),
    ...(fallback === "" ? {} : { default: fallback }),
    description: plain(entry.docs, REFERENCE_LIMITS.text),
  };
}

function summaryOf(docs: unknown): readonly string[] {
  if (typeof docs !== "string") return [];
  return docs
    .split(/\r?\n[^\S\n]*\r?\n/)
    .map((paragraph) => plain(paragraph, REFERENCE_LIMITS.text))
    .filter((paragraph) => paragraph !== "")
    .slice(0, REFERENCE_LIMITS.paragraphs);
}

function component(entry: Source, where: string): ComponentDoc {
  const tag = entry.tag;
  if (typeof tag !== "string" || !TAG.test(tag)) {
    throw new Error(`${where}.tag must be an idg- element name of lower-case words`);
  }
  const at = (key: string) => `${where}.${key}`;
  const description = (source: Source) => plain(source.docs, REFERENCE_LIMITS.text);
  return {
    tag,
    summary: summaryOf(entry.docs),
    properties: list(entry.props, at("props")).map((source, index) =>
      property(source, `${at("props")}[${String(index)}]`),
    ),
    events: list(entry.events, at("events")).map((source, index) => ({
      name: named(source, "event", `${at("events")}[${String(index)}]`),
      detail: plain(source.detail, REFERENCE_LIMITS.text),
      cancelable: source.cancelable === true,
      description: description(source),
    })),
    methods: list(entry.methods, at("methods")).map((source) => ({
      signature: plain(source.signature, REFERENCE_LIMITS.text),
      returns: plain(isSource(source.returns) ? source.returns.type : "", REFERENCE_LIMITS.text),
      description: description(source),
    })),
    slots: list(entry.slots, at("slots")).map((source) => ({
      name: plain(source.name, REFERENCE_LIMITS.name),
      description: description(source),
    })),
    parts: list(entry.parts, at("parts")).map((source, index) => ({
      name: named(source, "name", `${at("parts")}[${String(index)}]`),
      description: description(source),
    })),
    cssProperties: list(entry.styles, at("styles")).map((source, index) => ({
      name: named(source, "name", `${at("styles")}[${String(index)}]`),
      description: description(source),
    })),
  };
}

/**
 * The components package's `docs.json` as one record per component, in the file's order. Every
 * string is cleaned to text the content format accepts (no control or direction-changing character,
 * no line break, a bound on its length), and a tag is held to an element name, since it becomes a
 * path. Markup in a doc comment stays as written: the reference draws it as text.
 */
export function readComponentDocs(input: unknown): readonly ComponentDoc[] {
  if (!isSource(input) || !Array.isArray(input.components)) {
    throw new Error("docs.json must be an object with a components list");
  }
  const records = list(input.components, "components").map((entry, index) =>
    component(entry, `components[${String(index)}]`),
  );
  const seen = new Set<string>();
  for (const { tag } of records) {
    if (seen.has(tag)) throw new Error(`docs.json lists ${tag} twice`);
    seen.add(tag);
  }
  return records;
}
