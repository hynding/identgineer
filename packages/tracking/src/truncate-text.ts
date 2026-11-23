/**
 * The first `maxUnits` UTF-16 units of well-formed text, ending on a code point boundary: a
 * surrogate pair that the cut would split is left out whole.
 */
export const truncateText = (text: string, maxUnits: number): string => {
  if (text.length <= maxUnits) return text;
  const cut = text.slice(0, maxUnits);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
};
