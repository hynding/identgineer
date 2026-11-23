/** Shown in place of a character that is not allowed to show as itself. */
const MARK = "�";

const ZERO_WIDTH_JOINER = 0x200d;
const ELLIPSIS = "…";

// White space that is a control character: it separates words and is harmless as a space.
const SPACING_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

// Controls, the format characters (the bidirectional controls, the zero width and invisible ones,
// the tag characters) and every character Unicode says is ignored when drawn, which includes the
// Hangul fillers and the variation selectors. None of them draws anything itself, but they change
// how what is around them is drawn, or make two different strings look alike. The braille blank and
// the musical symbol beginning of beam are not ignorable, and draw as nothing.
const INVISIBLE = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800\u{1D159}]$/u;
const COMBINING_MARK = /^\p{M}$/u;
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;
const EMOJI = /^\p{Emoji}$/u;
const EMOJI_BEFORE_JOINER = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}]$/u;
const EMOJI_AFTER_JOINER = /^\p{Extended_Pictographic}$/u;
const HAN = /^\p{Script=Han}$/u;
const MONGOLIAN_LETTER = /^[\p{L}]$/u;

// The scripts in which a zero width joiner or non-joiner changes how letters join or which form
// they take. In any other script, such as Latin, it draws nothing and only makes two strings that
// look the same differ.
const JOINING_SCRIPT =
  /^[\p{Script_Extensions=Arabic}\p{Script_Extensions=Syriac}\p{Script_Extensions=Nko}\p{Script_Extensions=Mongolian}\p{Script_Extensions=Phags_Pa}\p{Script_Extensions=Mandaic}\p{Script_Extensions=Adlam}\p{Script_Extensions=Devanagari}\p{Script_Extensions=Bengali}\p{Script_Extensions=Gurmukhi}\p{Script_Extensions=Gujarati}\p{Script_Extensions=Oriya}\p{Script_Extensions=Tamil}\p{Script_Extensions=Telugu}\p{Script_Extensions=Kannada}\p{Script_Extensions=Malayalam}\p{Script_Extensions=Sinhala}\p{Script_Extensions=Khmer}\p{Script_Extensions=Myanmar}\p{Script_Extensions=Tibetan}\p{Script_Extensions=Thaana}]$/u;
const MONGOLIAN = /^\p{Script_Extensions=Mongolian}$/u;

/**
 * The most combining marks kept on one character. Real text stacks several (Hebrew with points and
 * a cantillation mark, Vietnamese, Thai, Tibetan); more is a way to draw over the lines around.
 */
const MAX_COMBINING_MARKS = 8;

const ZERO_WIDTH_NON_JOINER = 0x200c;
const BLACK_FLAG = 0x1f3f4;
const TAG_END = 0xe007f;
/** The most tag letters or digits in a flag's tag sequence (the longest real one has six). */
const MAX_TAG_LETTERS = 10;

// Text and emoji presentation selectors only mean something after a character that has an emoji form.
const EMOJI_PRESENTATION_SELECTORS = new Set([0xfe0e, 0xfe0f]);

const isIdeographicVariationSelector = (code: number) => code >= 0xe0100 && code <= 0xe01ef;
const isMongolianFreeVariationSelector = (code: number) =>
  (code >= 0x180b && code <= 0x180d) || code === 0x180f;
const isTagLetterOrDigit = (code: number) =>
  (code >= 0xe0030 && code <= 0xe0039) || (code >= 0xe0061 && code <= 0xe007a);

function isLoneSurrogate(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return character.length === 1 && code >= 0xd800 && code <= 0xdfff;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

// A joiner is kept where it does something: between letters or marks of a script that joins, or
// in an emoji sequence, where an emoji's own presentation selector or skin tone may come before it.
function joinerMeans(before: string | undefined, after: string | undefined, code: number): boolean {
  if (before === undefined || after === undefined) return false;
  if (LETTER_OR_MARK.test(before) && LETTER_OR_MARK.test(after)) {
    if (JOINING_SCRIPT.test(before) && JOINING_SCRIPT.test(after)) return true;
  }
  if (code !== ZERO_WIDTH_JOINER) return false;
  const selector = EMOJI_PRESENTATION_SELECTORS.has(before.codePointAt(0) ?? 0);
  return (selector || EMOJI_BEFORE_JOINER.test(before)) && EMOJI_AFTER_JOINER.test(after);
}

// A variation selector is kept after the kind of character it varies: an ideograph for the
// ideographic ones, a Mongolian letter for the Mongolian free ones, an emoji for the emoji ones.
function selectorMeans(code: number, before: string | undefined): boolean {
  if (before === undefined) return false;
  if (isIdeographicVariationSelector(code)) return HAN.test(before);
  if (isMongolianFreeVariationSelector(code)) {
    return MONGOLIAN.test(before) && MONGOLIAN_LETTER.test(before);
  }
  if (EMOJI_PRESENTATION_SELECTORS.has(code)) return EMOJI.test(before);
  return false;
}

/**
 * The characters of a flag's tag sequence that start at `from` (the black flag), kept as they are
 * when it is well formed: the flag, one to ten tag letters or digits and the end tag.
 */
function tagSequenceEnd(characters: readonly string[], from: number): number | undefined {
  let at = from + 1;
  while (at < characters.length && isTagLetterOrDigit(characters[at]?.codePointAt(0) ?? 0)) at += 1;
  const letters = at - from - 1;
  const ends = characters[at]?.codePointAt(0) === TAG_END;
  return ends && letters >= 1 && letters <= MAX_TAG_LETTERS ? at : undefined;
}

function hidesItself(character: string, before: string | undefined): boolean {
  if (isLoneSurrogate(character)) return true;
  const code = character.codePointAt(0) ?? 0;
  if (
    isIdeographicVariationSelector(code) ||
    isMongolianFreeVariationSelector(code) ||
    EMOJI_PRESENTATION_SELECTORS.has(code)
  ) {
    return !selectorMeans(code, before);
  }
  return INVISIBLE.test(character);
}

/**
 * Text from the public internet made safe to draw. Each character that could change how its
 * neighbours are drawn or hide itself is replaced by a visible mark, one for one, so that a reader
 * sees something was there: bidirectional controls (an event named `pay<RLO>fdp.exe` would show
 * as `payexe.pdf`), the other control, invisible and ignorable characters (the Hangul fillers, the
 * braille blank, stray tag characters) and lone surrogates. Line breaks and tabs become a space.
 * Some invisible characters mean something in some text and are kept only there: a zero width
 * joiner or non-joiner between letters or marks of a script that joins (Arabic, Syriac, Mongolian,
 * the Indic scripts, Sinhala, Khmer, Myanmar and others) and a joiner inside an emoji sequence; an
 * ideographic variation selector directly after an ideograph; a Mongolian free variation selector
 * directly after a Mongolian letter; an emoji presentation selector after an emoji; and a
 * well-formed flag tag sequence. Between Latin letters a joiner is marked. More than eight
 * combining marks on a character are cut, and a mark shows that. Text that would draw as nothing
 * (only white space or combining marks) is one mark. Everything else, in any script, is kept.
 */
export function neutraliseText(value: unknown): string {
  const characters = Array.from(asText(value));
  const neutralised: string[] = [];
  let marks = 0;
  let sequenceEnd = -1;
  characters.forEach((character, index) => {
    const code = character.codePointAt(0) ?? 0;
    let shown = character;
    if (index > sequenceEnd && code === BLACK_FLAG)
      sequenceEnd = tagSequenceEnd(characters, index) ?? -1;
    if (index <= sequenceEnd) {
      // Inside a well-formed tag sequence, where the tag characters are the flag's own.
      neutralised.push(character);
      marks = 0;
      return;
    }
    if (SPACING_CONTROLS.has(code)) shown = " ";
    else if (code === ZERO_WIDTH_JOINER || code === ZERO_WIDTH_NON_JOINER) {
      shown = joinerMeans(characters[index - 1], characters[index + 1], code) ? character : MARK;
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
function truncateText(value: unknown, limit: number): string {
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
