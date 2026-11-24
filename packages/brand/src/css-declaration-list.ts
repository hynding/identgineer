/** One declaration of a style attribute, as CSS reads it. */
export interface CssDeclaration {
  /** An identifier, lower-cased: CSS property names are ASCII case-insensitive. */
  readonly property: string;
  /** As written after the colon, without a final `!important`; comments and strings included. */
  readonly value: string;
  readonly important: boolean;
}

const CSS_WHITESPACE = new Set([" ", "\t", "\n", "\r", "\f"]);
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
// A character that continues an identifier, so a `url(` after it is not a url token. A `#` or `@`
// before it makes a hash or at-keyword of the word instead.
const WORD_BEFORE_URL = /[A-Za-z0-9_\-#@\u0080-\u{10FFFF}]/u;

/** What an unquoted url may not hold: CSS reads it as a bad url, recovered from at the next `)`. */
function isBadInUrl(character: string): boolean {
  if (character === '"' || character === "'" || character === "(" || character === "\\")
    return true;
  const code = character.charCodeAt(0);
  return code <= 0x08 || code === 0x0b || (code >= 0x0e && code <= 0x1f) || code === 0x7f;
}
const PROPERTY = /^(?:--[A-Za-z0-9_-]*|-?[A-Za-z_][A-Za-z0-9_-]*)/;
const IMPORTANT = /^![ \t\n\r\f]*important[ \t\n\r\f]*$/i;

/** Where an unquoted url token that starts at `at` ends, past its `)`; `undefined` if bad. */
function unquotedUrlEnd(style: string, at: number): number | undefined {
  let index = at;
  while (index < style.length) {
    const character = style[index] ?? "";
    if (character === ")") return index + 1;
    if (CSS_WHITESPACE.has(character)) {
      while (CSS_WHITESPACE.has(style[index] ?? "")) index += 1;
      return style[index] === ")" ? index + 1 : undefined;
    }
    if (isBadInUrl(character)) return undefined;
    index += 1;
  }
  return undefined;
}

/** Whether a url token starts at `at`: `url(` as a whole word, not followed by a quote. */
function urlTokenStart(style: string, at: number): number | undefined {
  if (style.slice(at, at + 4).toLowerCase() !== "url(") return undefined;
  if (at > 0 && WORD_BEFORE_URL.test(style.slice(at - 1, at))) return undefined;
  let index = at + 4;
  while (CSS_WHITESPACE.has(style[index] ?? "")) index += 1;
  const next = style[index];
  return next === '"' || next === "'" ? undefined : index;
}

/**
 * The places a style splits into declarations, or `undefined` where CSS error recovery would decide
 * the split: an escape, an unterminated comment, string, bracket or url, a string across a line, a
 * stray or mismatched closing bracket, a brace or an at-sign outside every bracket.
 */
function declarationTexts(style: string): string[] | undefined {
  const texts: string[] = [];
  const open: string[] = [];
  let start = 0;
  let index = 0;
  while (index < style.length) {
    const character = style[index] ?? "";
    if (character === "\\") return undefined;
    if (style.startsWith("/*", index)) {
      const end = style.indexOf("*/", index + 2);
      if (end === -1) return undefined;
      index = end + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      let end = index + 1;
      while (end < style.length && style[end] !== character) {
        if ("\n\r\f".includes(style[end] ?? "")) return undefined;
        end += 1;
      }
      if (end >= style.length) return undefined;
      index = end + 1;
      continue;
    }
    const url = urlTokenStart(style, index);
    if (url !== undefined) {
      const end = unquotedUrlEnd(style, url);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    const closing = CLOSING[character];
    if (closing !== undefined) {
      if (character === "{" && open.length === 0) return undefined;
      open.push(closing);
    } else if (character === ")" || character === "]" || character === "}") {
      if (open.pop() !== character) return undefined;
    } else if (open.length === 0 && character === "@") {
      return undefined;
    } else if (open.length === 0 && character === ";") {
      texts.push(style.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  if (open.length > 0) return undefined;
  texts.push(style.slice(start));
  return texts;
}

/** Past the white space and comments from `at` (comments are known to be closed). */
function skipSpace(text: string, at: number): number {
  let index = at;
  for (;;) {
    if (CSS_WHITESPACE.has(text[index] ?? "")) index += 1;
    else if (text.startsWith("/*", index)) index = text.indexOf("*/", index + 2) + 2;
    else return index;
  }
}

/**
 * One declaration: `null` for nothing but white space and comments, `undefined` for anything but
 * `name: value`, which CSS would recover from in ways not certain here.
 */
function declaration(text: string): CssDeclaration | null | undefined {
  const start = skipSpace(text, 0);
  if (start === text.length) return null;
  const name = PROPERTY.exec(text.slice(start))?.[0];
  if (name === undefined) return undefined;
  const colon = skipSpace(text, start + name.length);
  if (text[colon] !== ":") return undefined;
  const value = text.slice(colon + 1);
  const mark = value.lastIndexOf("!");
  const important = mark !== -1 && IMPORTANT.test(value.slice(mark));
  return {
    property: name.toLowerCase(),
    value: important ? value.slice(0, mark) : value,
    important,
  };
}

/**
 * The declarations of a style attribute, split as CSS Syntax splits them: comments are skipped,
 * strings and brackets hold a `;` without ending a declaration. `undefined` when the list is
 * malformed in a way where CSS error recovery decides what is read, or holds anything but
 * `name: value` declarations.
 */
export function splitDeclarationList(style: string): CssDeclaration[] | undefined {
  const texts = declarationTexts(style);
  if (texts === undefined) return undefined;
  const declarations: CssDeclaration[] = [];
  for (const text of texts) {
    const read = declaration(text);
    if (read === undefined) return undefined;
    if (read !== null) declarations.push(read);
  }
  return declarations;
}
