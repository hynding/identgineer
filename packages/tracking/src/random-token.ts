const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The random source the SDK needs, as `crypto` offers it. */
export interface RandomSource {
  getRandomValues(array: Uint8Array<ArrayBuffer>): unknown;
}

const base64Url = (bytes: Uint8Array): string => {
  let text = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
    for (let position = 0; position < characters; position += 1) {
      text += ALPHABET.charAt((chunk >> (18 - 6 * position)) & 63);
    }
  }
  return text;
};

/**
 * 128 random bits as 22 base64url characters, or `undefined` when there is no source of
 * randomness: an identifier is never made from `Math.random` or the clock, which can be guessed.
 */
export const randomToken = (source: RandomSource | undefined): string | undefined => {
  if (typeof source?.getRandomValues !== "function") return undefined;
  try {
    const bytes = new Uint8Array(16);
    source.getRandomValues(bytes);
    return base64Url(bytes);
  } catch {
    return undefined;
  }
};
