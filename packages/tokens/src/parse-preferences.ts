import { flattenTokens } from "./flatten-tokens.ts";
import { isRecord } from "./is-record.ts";
import { PREFERENCE_GROUP_NAMES, type PreferenceGroupName } from "./preferences-media.ts";
import type { FlatToken } from "./token-types.ts";

export interface PreferencesSource {
  readonly file: string;
  readonly json: unknown;
}

export interface ParsedPreferences {
  readonly file: string;
  /** One entry per supported preference, in emission order. */
  readonly groups: readonly { readonly name: PreferenceGroupName; readonly tokens: FlatToken[] }[];
}

function isGroupName(name: string): name is PreferenceGroupName {
  return PREFERENCE_GROUP_NAMES.some((known) => known === name);
}

export function parsePreferences(source: PreferencesSource): ParsedPreferences {
  if (!isRecord(source.json)) {
    throw new Error(`${source.file}: the document root must be an object`);
  }
  const json = source.json;
  for (const key of Object.keys(json)) {
    if (!key.startsWith("$") && !isGroupName(key)) {
      throw new Error(`${source.file}: unknown preference group "${key}"`);
    }
  }
  return {
    file: source.file,
    groups: PREFERENCE_GROUP_NAMES.map((name) => {
      const group = json[name];
      if (!isRecord(group)) {
        throw new Error(`${source.file}: missing the preference group "${name}"`);
      }
      return { name, tokens: flattenTokens(source.file, group) };
    }),
  };
}
