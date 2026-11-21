const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

function firstCharacter(word: string): string {
  // Spread by code point, so a character outside the basic plane is not cut in half.
  return [...word].find((character) => LETTER_OR_NUMBER.test(character)) ?? "";
}

/**
 * The letters an avatar shows in place of a picture: the first letter of the first and of the last
 * word of the name, or just the first when it is one word. Empty when the name has no letters.
 */
export function initials(name: string | null | undefined): string {
  const letters = (name ?? "")
    .split(/\s+/)
    .map(firstCharacter)
    .filter((letter) => letter !== "");
  const [first] = letters;
  const last = letters[letters.length - 1];
  const picked = letters.length > 1 ? `${first ?? ""}${last ?? ""}` : (first ?? "");
  return picked.toLocaleUpperCase();
}
