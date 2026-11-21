import { parseMode, type ModeAxis, type ModeSource } from "./parse-mode.ts";

export interface ModeDefinition<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
}

/** Everything is read from the same JSON the CSS is built from, so the two cannot drift. */
export function buildModeRegistry<Id extends string>(
  sources: readonly ModeSource[],
  axis: ModeAxis,
  isKnownId: (id: string) => id is Id,
): ModeDefinition<Id>[] {
  return sources.map((source) => {
    if (!isKnownId(source.id)) {
      throw new Error(`${source.file}: "${source.id}" is not a known ${axis} id`);
    }
    const { label, description } = parseMode(source, axis);
    return { id: source.id, label, description };
  });
}
