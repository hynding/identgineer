import { flattenTokens } from "./flatten-tokens.ts";
import { isRecord } from "./is-record.ts";
import type { FlatToken } from "./token-types.ts";

export interface ModeSource {
  readonly id: string;
  readonly file: string;
  readonly json: unknown;
}

export type ModeAxis = "design" | "layout" | "ux";

const NOUNS: Record<ModeAxis, string> = { design: "design", layout: "layout", ux: "UX mode" };
const METADATA_KEYS = ["$description", "$extensions"];

export interface ParsedMode {
  readonly axis: ModeAxis;
  readonly id: string;
  readonly file: string;
  readonly label: string;
  readonly description: string;
  /** Whether a brand theme's corners replace this design's radii; false for layouts and UX modes. */
  readonly followsBrandCorners: boolean;
  readonly tokens: readonly FlatToken[];
  /** Tokens that replace `tokens` when a design cannot be translucent; always empty for layouts and UX modes. */
  readonly opaque: readonly FlatToken[];
}

function readMetadata(source: ModeSource, json: Record<string, unknown>, noun: string) {
  const extensions = json.$extensions;
  const identgineer = isRecord(extensions) ? extensions.identgineer : undefined;
  const label = isRecord(identgineer) ? identgineer.label : undefined;
  if (typeof label !== "string" || label === "") {
    throw new Error(`${source.file}: ${noun} "${source.id}" needs $extensions.identgineer.label`);
  }
  if (typeof json.$description !== "string" || json.$description === "") {
    throw new Error(`${source.file}: ${noun} "${source.id}" needs a $description`);
  }
  return { label, description: json.$description };
}

function readFollowsBrandCorners(
  source: ModeSource,
  json: Record<string, unknown>,
  axis: ModeAxis,
) {
  const extensions = json.$extensions;
  const identgineer = isRecord(extensions) ? extensions.identgineer : undefined;
  const flag = isRecord(identgineer) ? identgineer.followsBrandCorners : undefined;
  const noun = NOUNS[axis];
  if (axis !== "design") {
    if (flag === undefined) return false;
    throw new Error(
      `${source.file}: ${noun} "${source.id}" cannot declare followsBrandCorners; only designs do`,
    );
  }
  if (typeof flag !== "boolean") {
    throw new Error(
      `${source.file}: ${noun} "${source.id}" needs $extensions.identgineer.followsBrandCorners (true or false)`,
    );
  }
  return flag;
}

function readGroup(source: ModeSource, json: Record<string, unknown>, name: string, noun: string) {
  const group = json[name];
  if (!isRecord(group)) {
    throw new Error(`${source.file}: ${noun} "${source.id}" is missing the "${name}" group`);
  }
  return flattenTokens(source.file, group);
}

function assertKnownGroups(
  source: ModeSource,
  json: Record<string, unknown>,
  allowed: readonly string[],
  noun: string,
): void {
  for (const key of Object.keys(json)) {
    if (!METADATA_KEYS.includes(key) && !allowed.includes(key)) {
      throw new Error(`${source.file}: ${noun} "${source.id}" has an unknown group "${key}"`);
    }
  }
}

export function parseMode(source: ModeSource, axis: ModeAxis): ParsedMode {
  if (!isRecord(source.json)) {
    throw new Error(`${source.file}: the document root must be an object`);
  }
  const noun = NOUNS[axis];
  const allowed = axis === "design" ? ["tokens", "opaque"] : ["tokens"];
  assertKnownGroups(source, source.json, allowed, noun);
  return {
    axis,
    id: source.id,
    file: source.file,
    ...readMetadata(source, source.json, noun),
    followsBrandCorners: readFollowsBrandCorners(source, source.json, axis),
    tokens: readGroup(source, source.json, "tokens", noun),
    opaque: "opaque" in source.json ? readGroup(source, source.json, "opaque", noun) : [],
  };
}
