/** Shown in place of a character that is not allowed to show as itself. */
export const MARK = "�";

const ZERO_WIDTH_JOINER = 0x200d;
const ELLIPSIS = "…";

// White space that is a control character: it separates words and is harmless as a space.
const SPACING_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

// Controls, the format characters (the bidirectional controls, the zero width and invisible ones,
// the tag characters) and every character Unicode says is ignored when drawn, which includes the
// Hangul fillers and the variation selectors. None of them draws anything itself, but they change
// how what is around them is drawn, or make two different strings look alike. The braille blank
// is not ignorable, and is a full cell of nothing.
const INVISIBLE = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800]$/u;
const WHITE_SPACE = /^\s$/u;
const COMBINING_MARK = /^\p{M}$/u;
const EMOJI = /^\p{Emoji}$/u;

/** The most combining marks kept on one character: more is a way to draw over the lines around. */
const MAX_COMBINING_MARKS = 3;

// Text and emoji presentation selectors only mean something after a character that has an emoji form.
const EMOJI_PRESENTATION_SELECTORS = new Set([0xfe0e, 0xfe0f]);

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

// A joiner sits between plain characters, and an emoji's own presentation selector may come before it.
function joinsEmoji(before: string | undefined, after: string | undefined): boolean {
  const selector =
    before !== undefined && EMOJI_PRESENTATION_SELECTORS.has(before.codePointAt(0) ?? 0);
  return (selector || isPlain(before)) && isPlain(after);
}

function hidesItself(character: string, previous: string | undefined): boolean {
  if (isLoneSurrogate(character)) return true;
  const code = character.codePointAt(0) ?? 0;
  if (EMOJI_PRESENTATION_SELECTORS.has(code))
    return previous === undefined || !EMOJI.test(previous);
  return INVISIBLE.test(character);
}

/**
 * Text from the public internet made safe to draw. Each character that could change how its
 * neighbours are drawn or hide itself is replaced by a visible mark, one for one, so that a reader
 * sees something was there: bidirectional controls (an event named `pay<RLO>fdp.exe` would show
 * as `payexe.pdf`), the other control, invisible and ignorable characters (fillers, variation
 * selectors) and lone surrogates. Line breaks and tabs become a space. A zero width joiner stays
 * only between two plain characters, and an emoji presentation selector only after an emoji, where
 * emoji sequences need them. More than three combining marks on a character are cut, and a mark
 * shows that. Text that would draw as nothing (only white space or combining marks) is one mark.
 * Everything else, in any script, is kept.
 */
export function neutraliseText(value: unknown): string {
  const characters = Array.from(asText(value));
  const neutralised: string[] = [];
  let marks = 0;
  characters.forEach((character, index) => {
    const code = character.codePointAt(0) ?? 0;
    let shown = character;
    if (SPACING_CONTROLS.has(code)) shown = " ";
    else if (code === ZERO_WIDTH_JOINER) {
      shown = joinsEmoji(characters[index - 1], characters[index + 1]) ? character : MARK;
    } else if (hidesItself(character, characters[index - 1])) shown = MARK;
    if (COMBINING_MARK.test(shown)) {
      marks += 1;
      if (marks > MAX_COMBINING_MARKS) {
        if (marks === MAX_COMBINING_MARKS + 1) neutralised.push(MARK);
        return;
      }
    } else {
      marks = 0;
    }
    neutralised.push(shown);
  });
  const text = neutralised.join("");
  return text !== "" && /^[\s\p{M}]*$/u.test(text) ? MARK : text;
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
