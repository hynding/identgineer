/** Shown in place of a character that is not allowed to show as itself. */
export const MARK = "�";

const ZERO_WIDTH_JOINER = 0x200d;
const ELLIPSIS = "…";

// White space that is a control character: it separates words and is harmless as a space.
const SPACING_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

// Controls, and the format characters (the bidirectional controls, the zero width and invisible
// ones, the tag characters), which draw nothing themselves but change how what is around them is
// drawn, or make two different strings look alike.
const INVISIBLE = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]$/u;
const WHITE_SPACE = /^\s$/u;

function isLoneSurrogate(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return character.length === 1 && code >= 0xd800 && code <= 0xdfff;
}

function isPlain(character: string | undefined): boolean {
  return (
    character !== undefined &&
    !isLoneSurrogate(character) &&
    !INVISIBLE.test(character) &&
    !WHITE_SPACE.test(character)
  );
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/**
 * Text from the public internet made safe to draw. Each character that could change how its
 * neighbours are drawn or hide itself is replaced by a visible mark, one for one, so that a reader
 * sees something was there: bidirectional controls (an event named `pay<RLO>fdp.exe` would show
 * as `payexe.pdf`), the other control and invisible format characters, and lone surrogates. Line
 * breaks and tabs become a space. A zero width joiner stays only between two ordinary characters,
 * where emoji sequences need it. Everything else, in any script, is kept.
 */
export function neutraliseText(value: unknown): string {
  const characters = Array.from(asText(value));
  return characters
    .map((character, index) => {
      const code = character.codePointAt(0) ?? 0;
      if (SPACING_CONTROLS.has(code)) return " ";
      if (code === ZERO_WIDTH_JOINER) {
        return isPlain(characters[index - 1]) && isPlain(characters[index + 1]) ? character : MARK;
      }
      return isLoneSurrogate(character) || INVISIBLE.test(character) ? MARK : character;
    })
    .join("");
}

/**
 * At most `limit` characters (not code units, so an emoji is never cut in half), the last of them
 * an ellipsis when something was cut. Only as much of the text as the limit asks for is read.
 */
export function truncateText(value: unknown, limit: number): string {
  const characters: string[] = [];
  let cut = false;
  for (const character of asText(value)) {
    if (characters.length === limit) {
      cut = true;
      break;
    }
    characters.push(character);
  }
  if (!cut) return characters.join("");
  const kept = characters.slice(0, Math.max(limit - 1, 0));
  // A joiner at the cut would join the ellipsis to the character before it.
  while (kept[kept.length - 1]?.codePointAt(0) === ZERO_WIDTH_JOINER) kept.pop();
  return limit < 1 ? "" : kept.join("") + ELLIPSIS;
}

/** Untrusted text as it is drawn: cut to `limit` characters, then neutralised. */
export function displayText(value: unknown, limit: number): string {
  return neutraliseText(truncateText(value, limit));
}
