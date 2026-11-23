import { SvgLogoRejection } from "./svg-logo-rejection.ts";

function utf8Length(text: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < text.length && bytes <= stopAfter; index += 1) {
    const unit = text.charCodeAt(index);
    // A surrogate pair is four bytes, two per half; a lone half is refused later anyway.
    bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : unit >= 0xd800 && unit <= 0xdfff ? 2 : 3;
  }
  return bytes;
}

function decodeBytes(bytes: Uint8Array): string {
  // UTF-16 in either byte order announces itself with its mark; it is refused by name rather than
  // left to fail as broken UTF-8, so the error says what is wrong.
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    throw new SvgLogoRejection("invalid-encoding", "only UTF-8 is accepted, not UTF-16");
  }
  try {
    // ignoreBOM keeps a UTF-8 byte order mark as U+FEFF, so it is handled below like a string's.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new SvgLogoRejection("invalid-encoding", "is not valid UTF-8");
  }
}

/**
 * Turns the input into the text the reader works on: a string as it is, or bytes decoded as strict
 * UTF-8 (any invalid sequence refuses the input). One leading byte order mark is removed, and line
 * ends are read as XML reads them (CR LF and a lone CR become LF), so every offset afterwards is
 * into that text.
 */
export function decodeSvgInput(input: unknown, maxBytes: number): string {
  let text: string;
  if (typeof input === "string") {
    if (input.length > maxBytes || utf8Length(input, maxBytes) > maxBytes) {
      throw new SvgLogoRejection("too-large", `takes at most ${String(maxBytes)} bytes`);
    }
    text = input;
  } else if (input instanceof Uint8Array) {
    if (input.length > maxBytes) {
      throw new SvgLogoRejection("too-large", `takes at most ${String(maxBytes)} bytes`);
    }
    text = decodeBytes(input);
  } else {
    throw new SvgLogoRejection("wrong-type", "must be a string or UTF-8 bytes");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, "\n");
}
