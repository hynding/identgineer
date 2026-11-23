/**
 * The characters a logo may contain, written or as a character reference: XML 1.0's characters
 * less the C1 controls and DEL (never real text, and a classic way to confuse a decoder), the
 * byte order mark (accepted once, at the very start, and removed) and the bidirectional embedding,
 * override and isolate controls (they reorder what a title shows).
 */
export function isAllowedCodePoint(codePoint: number): boolean {
  if (codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd) return true;
  if (codePoint < 0x20) return false;
  if (codePoint < 0x7f) return true;
  if (codePoint < 0xa0) return false;
  if (codePoint >= 0x202a && codePoint <= 0x202e) return false;
  if (codePoint >= 0x2066 && codePoint <= 0x2069) return false;
  if (codePoint === 0xfeff) return false;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
  if (codePoint === 0xfffe || codePoint === 0xffff) return false;
  return codePoint <= 0x10ffff;
}

/** The offset of the first character that is not allowed (a lone surrogate included), or -1. */
export function findDisallowedCharacter(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return index;
      index += 1;
      continue;
    }
    if (!isAllowedCodePoint(unit)) return index;
  }
  return -1;
}

/** XML's white space: space, tab, line feed and carriage return, and nothing else. */
export function isXmlWhitespace(unit: number): boolean {
  return unit === 0x20 || unit === 0x9 || unit === 0xa || unit === 0xd;
}

export function isXmlWhitespaceOnly(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (!isXmlWhitespace(text.charCodeAt(index))) return false;
  }
  return true;
}

/** Removes XML white space at both ends (not the wider set `String.prototype.trim` removes). */
export function trimXmlWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isXmlWhitespace(text.charCodeAt(start))) start += 1;
  while (end > start && isXmlWhitespace(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
}
