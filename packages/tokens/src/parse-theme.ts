import { flattenTokens } from "./flatten-tokens.ts";
import type { FlatToken } from "./token-types.ts";
import { isRecord } from "./is-record.ts";

export interface ThemeSource {
  readonly id: string;
  readonly file: string;
  readonly json: unknown;
}

export interface ParsedTheme {
  readonly id: string;
  readonly file: string;
  readonly label: string;
  readonly description: string;
  /** Scheme-independent tokens: palette entries and typography. */
  readonly common: readonly FlatToken[];
  readonly light: readonly FlatToken[];
  readonly dark: readonly FlatToken[];
}

function readMetadata(source: ThemeSource, json: Record<string, unknown>) {
  const extensions = json.$extensions;
  const identgineer = isRecord(extensions) ? extensions.identgineer : undefined;
  const label = isRecord(identgineer) ? identgineer.label : undefined;
  if (typeof label !== "string" || label === "") {
    throw new Error(`${source.file}: theme "${source.id}" needs $extensions.identgineer.label`);
  }
  if (typeof json.$description !== "string" || json.$description === "") {
    throw new Error(`${source.file}: theme "${source.id}" needs a $description`);
  }
  return { label, description: json.$description };
}

function readGroup(source: ThemeSource, json: Record<string, unknown>, name: string) {
  const group = json[name];
  if (!isRecord(group)) {
    throw new Error(`${source.file}: theme "${source.id}" is missing the "${name}" group`);
  }
  return flattenTokens(source.file, group);
}

export function parseTheme(source: ThemeSource): ParsedTheme {
  if (!isRecord(source.json)) {
    throw new Error(`${source.file}: the document root must be an object`);
  }
  return {
    id: source.id,
    file: source.file,
    ...readMetadata(source, source.json),
    common: readGroup(source, source.json, "common"),
    light: readGroup(source, source.json, "light"),
    dark: readGroup(source, source.json, "dark"),
  };
}
