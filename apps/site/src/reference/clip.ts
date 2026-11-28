/** At most `limit` characters, the last an ellipsis when something was cut, never half a pair. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = limit - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${text.slice(0, end)}…`;
}

export interface Clipped {
  /** At most the limit, with an ellipsis where it stops short of the end of a sentence. */
  readonly head: string;
  /** The text after the head, which the reader has not been given yet. */
  readonly rest: string;
}

const backticks = (text: string) => (text.match(/`/g) ?? []).length;

/** The last place a pattern matches in the text, before `end`, where the code spans are all closed. */
function lastBoundary(text: string, pattern: RegExp, end: number, least: number): number {
  let found = -1;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at + match[0].length > end) break;
    if (at >= least && backticks(text.slice(0, at)) % 2 === 0) found = at;
  }
  return found;
}

/**
 * The text cut where a reader would stop: after the last sentence that fits, when that is more
 * than half the limit; else before the last comma, colon or semicolon in the second half; else
 * before the last space; and inside a word only when there is none to stop at. A cut that is not
 * at the end of a sentence ends in an ellipsis, and the rest is what follows it, so nothing is
 * said twice and nothing is lost. A code span (a pair of backticks) is never cut in half.
 */
export function clipAtWord(text: string, limit: number): Clipped {
  if (text.length <= limit) return { head: text, rest: "" };
  const half = limit / 2;
  const sentence = lastBoundary(text, /[.!?](?=\s)/g, limit, half - 1);
  if (sentence >= 0) {
    return { head: text.slice(0, sentence + 1), rest: text.slice(sentence + 1).trim() };
  }
  const room = limit - 1;
  const clause = lastBoundary(text, /[,;:](?=\s)/g, room + 1, half);
  if (clause >= 0) {
    return { head: `${text.slice(0, clause)}…`, rest: text.slice(clause + 1).trim() };
  }
  const space = lastBoundary(text, /\s/g, room + 1, 1);
  if (space >= 0) {
    const head = text.slice(0, space).replace(/[\s,;:.-]+$/, "");
    return { head: `${head}…`, rest: text.slice(space).trim() };
  }
  let end = room;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  if (backticks(text.slice(0, end)) % 2 === 1) end = text.lastIndexOf("`", end);
  return { head: `${text.slice(0, end)}…`, rest: text.slice(end) };
}
