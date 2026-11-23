import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const CORPUS = new URL("./__fixtures__/hostile-svg/", import.meta.url);
const EXPECTATIONS = JSON.parse(
  readFileSync(new URL("expectations.json", CORPUS), "utf8"),
) as Record<string, string>;
const FILES = readdirSync(fileURLToPath(CORPUS))
  .filter((name) => name.endsWith(".svg"))
  .sort();

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const wrap = (body: string): string => `<svg ${NS} viewBox="0 0 10 10">${body}</svg>`;

// Hostile inputs too large to keep as files, built here instead.
const GENERATED: readonly (readonly [string, string, string])[] = [
  [
    "an input over the byte limit",
    wrap(`<title>${"a".repeat(SVG_LOGO_LIMITS.inputBytes)}</title>`),
    "too-large",
  ],
  ["nesting a thousand deep", wrap("<g>".repeat(1000) + "</g>".repeat(1000)), "too-deep"],
  ["ten thousand elements", wrap("<path d='M0 0'/>".repeat(10_000)), "too-many-elements"],
  ["path data of 200,000 characters", wrap(`<path d="M0 0${" 1 1".repeat(50_000)}"/>`), "too-long"],
  ["an attribute of 100,000 characters", wrap(`<g fill="${"#".repeat(100_000)}"/>`), "too-long"],
  [
    "billion laughs through use, twenty-five wide and four deep",
    wrap(
      '<defs><path id="l0" d="M0 0"/>' +
        [1, 2, 3, 4]
          .map(
            (level) =>
              `<g id="l${String(level)}">${`<use href="#l${String(level - 1)}"/>`.repeat(25)}</g>`,
          )
          .join("") +
        '</defs><use href="#l4"/>',
    ),
    "expansion-too-large",
  ],
];

/** The checks every accepted output of the hostile corpus is held to, beyond the validator. */
function expectInert(svg: string): void {
  expect(findSanitisedSvgProblems(svg)).toEqual([]);
  // A payload may survive only as escaped text of a title or description.
  const outsideText = svg.replace(/<(title|desc)>[^<]*<\/\1>/g, "");
  expect(outsideText).not.toMatch(
    /alert|javascript|vbscript|data:|attacker|expression|binding|script/i,
  );
  expect(outsideText).not.toMatch(/\son[a-z]+=/i);
  expect(svg).not.toMatch(/<!|<\?/);
  expect(svg).not.toMatch(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i);
  for (const match of svg.matchAll(/url\(([^)]*)\)/g)) expect(match[1]).toMatch(/^#logo-\d+$/);
}

// Files whose payload is only ever text (escaped in a title or description), a comment (never
// written out, so not a removal) or ids that are renamed.
const KEPT_AS_TEXT_OR_RENAMED = new Set([
  "cdata-in-title.svg",
  "crlf-line-ends.svg",
  "id-dom-clobbering.svg",
  "mxss-svg-in-title.svg",
  "mxss-title-escaped-markup.svg",
  "mxss-xmp.svg",
  "polyglot-js-comment.svg",
  "utf7-payload-undeclared.svg",
  "utf8-bom.svg",
]);

function outcome(result: SvgLogoResult): string {
  return result.ok ? "accept" : `reject:${result.errors[0]?.code ?? "none"}`;
}

describe("the hostile SVG corpus", () => {
  it("has an expectation for every file and a file for every expectation", () => {
    expect(Object.keys(EXPECTATIONS).sort()).toEqual(FILES);
    expect(FILES.length).toBeGreaterThanOrEqual(150);
  });

  it.each(FILES)("renders %s inert or refuses it", (file) => {
    const bytes = new Uint8Array(readFileSync(new URL(file, CORPUS)));
    const result = sanitiseSvgLogo(bytes);
    expect(outcome(result)).toBe(EXPECTATIONS[file]);
    if (result.ok) {
      expectInert(result.svg);
      const again = sanitiseSvgLogo(result.svg);
      expect(again.ok && again.svg).toBe(result.svg);
    }
  });

  it.each(FILES)("gives the same answer for %s read as a string", (file) => {
    const bytes = readFileSync(new URL(file, CORPUS));
    const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
    // Bytes that are not UTF-8, or UTF-16 with its mark, have no faithful string; the rest must agree.
    if (text.includes("�") || bytes[0] === 0xff || bytes[0] === 0xfe) return;
    expect(outcome(sanitiseSvgLogo(text))).toBe(EXPECTATIONS[file]);
  });

  it.each(GENERATED)("refuses %s", (_label, input, code) => {
    expect(outcome(sanitiseSvgLogo(input))).toBe(`reject:${code}`);
  });

  it("drops the payload of every accepted file and says so", () => {
    for (const file of FILES.filter((name) => EXPECTATIONS[name] === "accept")) {
      const result = sanitiseSvgLogo(new Uint8Array(readFileSync(new URL(file, CORPUS))));
      if (!result.ok) throw new Error(file);
      if (!KEPT_AS_TEXT_OR_RENAMED.has(file)) expect(result.removedCount, file).toBeGreaterThan(0);
    }
  });
});
