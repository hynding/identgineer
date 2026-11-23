import { describe, expect, it } from "vitest";
import { displayText, neutraliseText } from "./untrusted-text";

const MARK = "\uFFFD";

describe("neutraliseText: characters that draw nothing", () => {
  it.each([
    ["Hangul filler U+3164", "\u3164"],
    ["halfwidth Hangul filler U+FFA0", "\uFFA0"],
    ["Hangul choseong filler U+115F", "\u115F"],
    ["Hangul jungseong filler U+1160", "\u1160"],
    ["braille blank U+2800", "\u2800"],
    ["combining grapheme joiner U+034F", "\u034F"],
    ["Mongolian free variation selector U+180B", "\u180B"],
    ["variation selector U+FE00", "\uFE00"],
    ["variation selector supplement U+E0100", "\u{E0100}"],
    ["tag character U+E0041", "\u{E0041}"],
    ["musical symbol beginning of beam U+1D159", "\u{1D159}"],
  ])("shows %s as a mark between two letters", (_name, character) => {
    expect(neutraliseText(`a${character}b`)).toBe(`a${MARK}b`);
  });

  it("shows text that would draw as nothing as a single mark", () => {
    expect(neutraliseText("\u3164")).toBe(MARK);
    expect(neutraliseText("\u2800\u2800")).toBe(`${MARK}${MARK}`);
    expect(neutraliseText("   ")).toBe(MARK);
    expect(neutraliseText(" \u00A0\u2003 ")).toBe(MARK);
    expect(neutraliseText("\n\t")).toBe(MARK);
    expect(neutraliseText("\u0301")).toBe(MARK);
  });

  it("leaves nothing as nothing: an empty string is not blank text", () => {
    expect(neutraliseText("")).toBe("");
  });

  it("keeps the emoji presentation selector after an emoji and the keycap sequence", () => {
    for (const text of ["\u2764\uFE0F", "\u263A\uFE0F ok", "1\uFE0F\u20E3", "\u2764\uFE0E"]) {
      expect(neutraliseText(text)).toBe(text);
    }
    expect(neutraliseText("a\uFE0Fb")).toBe(`a${MARK}b`);
    expect(neutraliseText("\uFE0F\u2764")).toBe(`${MARK}\u2764`);
  });

  it("keeps joined emoji sequences whole", () => {
    for (const text of ["\u{1F469}\u200D\u{1F4BB}", "\u{1F468}\u200D\u2764\uFE0F\u200D\u{1F468}"]) {
      expect(neutraliseText(text)).toBe(text);
    }
  });

  it("keeps at most eight combining marks on a character and shows that more were cut", () => {
    const eight = "\u0301".repeat(8);
    expect(neutraliseText(`e${eight}`)).toBe(`e${eight}`);
    expect(neutraliseText(`e${eight}\u0302`)).toBe(`e${eight}${MARK}`);
    expect(neutraliseText(`e${"\u0301".repeat(500)}x`)).toBe(`e${eight}${MARK}x`);
  });

  it("is idempotent for all of it", () => {
    const once = neutraliseText(`a\u3164b${"\u0301".repeat(9)}\u2764\uFE0F\uFE0Fc\u2800`);
    expect(neutraliseText(once)).toBe(once);
  });
});

// Real text, which must come through exactly as it went in.
const REAL_TEXT: readonly (readonly [string, string])[] = [
  ["Persian with a zero width non-joiner", "ثبت\u200Cنام"],
  ["Persian verb", "می\u200Cخواهم"],
  ["Arabic", "مرحبا بالعالم"],
  ["Hindi with a joiner after the virama", "क्\u200Dष"],
  ["Hindi", "नमस्ते दुनिया"],
  ["Bengali with a joiner after the virama", "র\u09CD\u200Dয"],
  ["Tamil", "தமிழ் மொழி"],
  ["Sinhala with a joiner", "ශ්\u200Dරී ලංකා"],
  ["Khmer with a non-joiner", "ក\u200Cខ ភាសាខ្មែរ"],
  ["Japanese with an ideographic variation sequence", "葛\u{E0100}城 辻\u{E0101}"],
  ["Japanese", "日本語のテキスト"],
  ["Mongolian with a free variation selector", "\u1820\u180B\u1828\u180D\u1820"],
  ["Hebrew with points and a cantillation mark", "\u05E9\u05C1\u05BC\u05B8\u05A3\u05D1"],
  ["Hebrew with five marks on one letter", "\u05D1\u05BC\u05B0\u05B8\u05A3\u05A5"],
  ["Vietnamese, decomposed", "Vie\u0302\u0323t Nam"],
  ["Thai with a vowel and a tone mark", "\u0E17\u0E35\u0E48"],
  ["Tibetan stack", "\u0F66\u0F92\u0FB2\u0F74\u0F56"],
  ["a flag from regional indicators", "🇯🇵"],
  [
    "the flag of England as a tag sequence",
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  ],
  ["the flag of Wales", "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}"],
  ["the flag of Scotland", "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"],
  ["a family", "👨\u200D👩\u200D👧\u200D👦"],
  ["the rainbow flag", "🏳\uFE0F\u200D🌈"],
  ["a woman technologist with a skin tone", "👩🏽\u200D💻"],
  ["a heart in a text with the emoji selector", "I \u2764\uFE0F you"],
];

// Text that is trying to be something it is not, and what it must be shown as.
const SPOOFS: readonly (readonly [string, string, string])[] = [
  ["a joiner between two Latin letters", "pay\u200Dpal", `pay${MARK}pal`],
  ["a non-joiner between two Latin letters", "pay\u200Cpal", `pay${MARK}pal`],
  ["a joiner between a Latin and an Arabic letter", "a\u200Dب", `a${MARK}ب`],
  ["a joiner at the end of an Arabic word", "ب\u200D", `ب${MARK}`],
  ["a joiner between Hebrew letters", "ש\u200Dל", `ש${MARK}ל`],
  ["an ideographic variation selector after a Latin letter", "a\u{E0100}", `a${MARK}`],
  ["an ideographic variation selector alone", "\u{E0100}", MARK],
  ["a Mongolian variation selector after a Latin letter", "a\u180B", `a${MARK}`],
  ["a stray tag letter", "a\u{E0067}b", `a${MARK}b`],
  ["a tag sequence with no end tag", "\u{1F3F4}\u{E0067}\u{E0062}x", `\u{1F3F4}${MARK}${MARK}x`],
  [
    "a tag sequence that is far too long",
    `\u{1F3F4}${"\u{E0061}".repeat(20)}\u{E007F}`,
    `\u{1F3F4}${MARK.repeat(21)}`,
  ],
  ["tags after a letter and not a flag", "a\u{E0067}\u{E007F}", `a${MARK}${MARK}`],
  ["a heap of combining marks", `e${"\u0301".repeat(40)}`, `e${"\u0301".repeat(8)}${MARK}`],
  ["an Arabic letter joined to a Devanagari one", "ب\u200Cक", `ب${MARK}क`],
  ["a Mongolian letter joined to an Arabic one", "\u1820\u200Dب", `\u1820${MARK}ب`],
  ["a Khmer letter joined to a Myanmar one", "ក\u200Dက", `ក${MARK}က`],
  ["a Tamil letter joined to a Telugu one", "த\u200Dత", `த${MARK}త`],
  [
    "a Latin letter with a Devanagari mark that has a Latin extension",
    "a\u0951\u200Dक",
    `a\u0951${MARK}क`,
  ],
  ["a joiner after a selector that was marked", "a\uFE0F\u200D😀", `a${MARK}${MARK}😀`],
  [
    "a flag tag sequence that is not one of the three",
    "\u{1F3F4}\u{E0075}\u{E0073}\u{E0074}\u{E0078}\u{E007F}",
    `\u{1F3F4}${MARK.repeat(5)}`,
  ],
  [
    "a Hindi joiner before an invisible selector",
    "क\u200C\u180B\u2800ज",
    `क${MARK}${MARK}${MARK}ज`,
  ],
  ["a Hangul filler as a name", "\u3164", MARK],
  ["a name of white space", " \u00A0 ", MARK],
];

describe("neutraliseText on real text", () => {
  it.each(REAL_TEXT)("leaves %s as it is", (_name, text) => {
    expect(neutraliseText(text)).toBe(text);
  });

  it.each(REAL_TEXT)("leaves %s as it is when it is cut to its own length", (_name, text) => {
    expect(displayText(text, Array.from(text).length)).toBe(text);
  });
});

describe("neutraliseText on spoofs", () => {
  it.each(SPOOFS)("shows %s as a mark where it hides", (_name, text, shown) => {
    expect(neutraliseText(text)).toBe(shown);
  });

  it.each(SPOOFS)("is stable for %s", (_name, text) => {
    const once = neutraliseText(text);
    expect(neutraliseText(once)).toBe(once);
  });
});

describe("neutraliseText", () => {
  it("leaves ordinary text as it is, in any script, with emoji and joined emoji", () => {
    for (const text of [
      "signup_completed",
      "Ünïcödé",
      "日本語",
      "שלום עולם",
      "مرحبا",
      "👩‍👩‍👧 ok",
      "a b",
    ]) {
      expect(neutraliseText(text)).toBe(text);
    }
  });

  it("turns line breaks, tabs and other white space controls into one space each", () => {
    expect(neutraliseText("a\nb\r\nc\td\u0085e f g\vh\fi")).toBe("a b  c d e f g h i");
  });

  it("replaces the bidirectional controls, which could reorder text around them", () => {
    for (const code of [
      0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f,
      0x061c,
    ]) {
      const text = `pay${String.fromCodePoint(code)}fdp.exe`;
      expect(neutraliseText(text)).toBe(`pay${MARK}fdp.exe`);
    }
  });

  it("replaces the other control characters and the invisible format characters", () => {
    for (const code of [
      0x0000, 0x0007, 0x001b, 0x007f, 0x0090, 0x009f, 0x200b, 0x2060, 0xfeff, 0x00ad, 0xe0041,
    ]) {
      expect(neutraliseText(`a${String.fromCodePoint(code)}b`)).toBe(`a${MARK}b`);
    }
  });

  it("replaces lone surrogates, which are not text", () => {
    expect(neutraliseText("a\ud800b")).toBe(`a${MARK}b`);
    expect(neutraliseText("a\udc00b")).toBe(`a${MARK}b`);
  });

  it("keeps the zero width joiner inside an emoji sequence, and marks one at an edge or doubled", () => {
    expect(neutraliseText("👨‍💻")).toBe("👨‍💻");
    expect(neutraliseText("‍x")).toBe(`${MARK}x`);
    expect(neutraliseText("x‍")).toBe(`x${MARK}`);
    expect(neutraliseText("x‍‍y")).toBe(`x${MARK}${MARK}y`);
  });

  it("makes a run of replaced characters show as a run, so how many there were is not hidden", () => {
    expect(neutraliseText("a‮‮‮b")).toBe(`a${MARK}${MARK}${MARK}b`);
  });

  it("is idempotent", () => {
    const once = neutraliseText("a‮b\nc‍");
    expect(neutraliseText(once)).toBe(once);
  });

  it("never throws for text that is not text", () => {
    expect(neutraliseText(undefined as unknown as string)).toBe("");
    expect(neutraliseText(null)).toBe("");
    expect(neutraliseText(12)).toBe("12");
  });
});

describe("truncateText", () => {
  it("leaves text at or under the limit alone", () => {
    expect(displayText("abc", 3)).toBe("abc");
  });

  it("cuts at the limit and marks the cut with an ellipsis that counts toward it", () => {
    expect(displayText("abcdef", 4)).toBe("abc…");
  });

  it("counts characters and not code units, so it never cuts an emoji in half", () => {
    expect(displayText("😀😀😀😀", 3)).toBe("😀😀…");
    expect(displayText("😀😀😀", 3)).toBe("😀😀😀");
  });

  it("does not leave a joiner dangling before the ellipsis", () => {
    expect(displayText("👨‍💻xxxx", 3)).toBe("👨…");
  });

  it("stays quick and bounded for text that is a million characters long", () => {
    const start = performance.now();
    const cut = displayText("x".repeat(1_000_000), 10);
    expect(cut).toBe("xxxxxxxxx…");
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("displayText", () => {
  it("cuts first and neutralises what is left, so a huge string costs only its limit", () => {
    expect(displayText(`ab\u202e${"x".repeat(1_000_000)}`, 4)).toBe(`ab${MARK}…`);
  });

  it("shows a value that is not text as nothing, and a number as its digits", () => {
    expect(displayText({ toString: () => "<b>" }, 10)).toBe("");
    expect(displayText(42, 10)).toBe("42");
  });
});

// A seeded generator, so a failure can be run again.
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL = [
  "\u200C",
  "\u200D",
  "\u200B",
  "\u2060",
  "\uFE0E",
  "\uFE0F",
  "\uFE00",
  "\u{E0100}",
  "\u{E01EF}",
  "\u180B",
  "\u180D",
  "\u180F",
  "\u034F",
  "\u0301",
  "\u0302",
  "\u0951",
  "\u094D",
  "\u05BC",
  "\u20E3",
  "\u{E0067}",
  "\u{E0062}",
  "\u{E0065}",
  "\u{E006E}",
  "\u{E0073}",
  "\u{E0063}",
  "\u{E0074}",
  "\u{E007F}",
  "\u{1F3F4}",
  "\u3164",
  "\uFFA0",
  "\u115F",
  "\u2800",
  "\u{1D159}",
  "\u202E",
  "\u0085",
  "\n",
  " ",
  "a",
  "Z",
  "ب",
  "ث",
  "क",
  "ज",
  "র",
  "த",
  "త",
  "ශ",
  "ក",
  "က",
  "\u1820",
  "\u1828",
  "葛",
  "辻",
  "ש",
  "ת",
  "😀",
  "👩",
  "💻",
  "❤",
  "\u{1F3FD}",
  "1",
  "#",
  MARK,
  "\uD800",
];

describe("neutraliseText on random strings from the awkward characters", () => {
  const next = generator(20260301);
  const strings = Array.from({ length: 60_000 }, () => {
    const length = 1 + Math.floor(next() * 9);
    return Array.from({ length }, () => POOL[Math.floor(next() * POOL.length)] ?? "a").join("");
  });

  it("is a fixed point: neutralising the result changes nothing", () => {
    const changed = strings.filter(
      (text) => neutraliseText(neutraliseText(text)) !== neutraliseText(text),
    );
    expect(
      changed
        .slice(0, 5)
        .map((text) => Array.from(text).map((c) => c.codePointAt(0)?.toString(16))),
    ).toEqual([]);
  });

  it("leaves no invisible character outside the shapes that are documented", () => {
    const INVISIBLE =
      /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\u2800\u{1D159}]$/u;
    const bad: string[] = [];
    for (const text of strings) {
      const out = Array.from(neutraliseText(text));
      out.forEach((character, index) => {
        if (!INVISIBLE.test(character)) return;
        const code = character.codePointAt(0) ?? 0;
        const before = out[index - 1] ?? "";
        const after = out[index + 1] ?? "";
        let fine = false;
        if (code === 0x200c || code === 0x200d) {
          fine =
            /[\p{L}\p{M}\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F]/u.test(before) &&
            /[\p{L}\p{Extended_Pictographic}]/u.test(after);
        } else if (code === 0xfe0e || code === 0xfe0f) fine = /\p{Emoji}/u.test(before);
        else if (code >= 0xe0100 && code <= 0xe01ef) fine = /\p{Script=Han}/u.test(before);
        else if ((code >= 0x180b && code <= 0x180d) || code === 0x180f) {
          fine = /\p{Script=Mongolian}/u.test(before);
        } else if (code >= 0xe0020 && code <= 0xe007f) {
          const run = out.join("");
          fine = /\u{1F3F4}[\u{E0061}-\u{E007A}]{5}\u{E007F}/u.test(run);
        }
        if (!fine)
          bad.push(
            Array.from(text)
              .map((c) => c.codePointAt(0)?.toString(16))
              .join(" "),
          );
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
