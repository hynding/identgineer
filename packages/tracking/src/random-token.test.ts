import { describe, expect, it } from "vitest";
import { randomToken } from "./random-token.ts";
import { TOKEN_PATTERN } from "./wire-format.ts";

const filling = (bytes: readonly number[]) => ({
  getRandomValues: <T extends ArrayBufferView>(array: T): T => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  },
});

describe("randomToken", () => {
  it("encodes 128 bits as 22 base64url characters without padding", () => {
    expect(randomToken(filling(new Array<number>(16).fill(0)))).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    expect(randomToken(filling(new Array<number>(16).fill(255)))).toBe("_____________________w");
    expect(randomToken(filling(Array.from({ length: 16 }, (_v, i) => i)))).toBe(
      "AAECAwQFBgcICQoLDA0ODw",
    );
  });

  it("uses the characters the wire format allows", () => {
    const token = randomToken(globalThis.crypto);
    expect(token).toMatch(TOKEN_PATTERN);
    expect(token).toHaveLength(22);
  });

  it("asks for 16 bytes and for nothing else", () => {
    const sizes: number[] = [];
    randomToken({
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        sizes.push(array.byteLength);
        return array;
      },
    });
    expect(sizes).toEqual([16]);
  });

  it("returns undefined with no random source, never a guessable value", () => {
    expect(randomToken(undefined)).toBeUndefined();
    expect(randomToken({} as never)).toBeUndefined();
  });

  it("returns undefined when the source throws", () => {
    expect(
      randomToken({
        getRandomValues: () => {
          throw new Error("no entropy");
        },
      }),
    ).toBeUndefined();
  });
});
