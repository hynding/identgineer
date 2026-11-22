/** bcrypt reads the first 72 bytes of a password, so the SDK refuses a longer new one. */
export const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

/** The length of the text in UTF-8 bytes: an accented letter takes two, an emoji four. */
export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}
