/** How many colour pairs idg-avatar can choose between. */
export const NAME_TONES = 6;

// 32-bit FNV-1a, which spreads short strings well enough and needs no library.
const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;

/**
 * Picks a colour pair for a name. The same person is always the same colour, on every page and
 * every render, without storing anything.
 */
export function nameTone(name: string): number {
  let hash = OFFSET_BASIS;
  for (const character of name.trim().toLowerCase()) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), PRIME) >>> 0;
  }
  return hash % NAME_TONES;
}
