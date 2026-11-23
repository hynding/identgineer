import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";

// Logos built the way real ones are, at the large end of what each kind holds: detailed emblems,
// traced artwork near the input limit, a wordmark, gradients under clip paths, a pattern of symbols
// placed with use, dashed rings and a Figma export with alpha masks. Each must stay inside both
// budgets with room to spare; the shares below are what each uses, rounded up, so a change to the
// cost model that squeezes real logos shows here first.

const random = seeded(15_004);
const hex = (index: number): string =>
  `#${((index * 0x9e3779 + 0x406080) & 0xffffff).toString(16).padStart(6, "0")}`;
const round = (value: number): string => String(Math.round(value * 100) / 100);

/** A closed blob of `count` cubics around (cx, cy), as tracing or an editor writes one. */
function blob(count: number, cx: number, cy: number, radius: number): string {
  let data = `M${round(cx + radius)} ${round(cy)}`;
  for (let index = 1; index <= count; index += 1) {
    const angle = (index / count) * 2 * Math.PI;
    const reach = radius * (0.8 + 0.2 * random());
    const at = (offset: number): string =>
      `${round(cx + reach * Math.cos(angle - offset))} ${round(cy + reach * Math.sin(angle - offset))}`;
    data += `C${at(0.02)} ${at(0.01)} ${at(0)}`;
  }
  return `${data}Z`;
}

function logo(body: string, definitions = ""): string {
  const defs = definitions === "" ? "" : `<defs>${definitions}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${body}</svg>`;
}

function emblem(paths: number, step: number): string {
  return logo(
    Array.from(
      { length: paths },
      (_, index) =>
        `<path d="${blob(100, 256, 256, 250 - index * step)}" fill="${hex(index)}" stroke="#000" stroke-width="1"/>`,
    ).join(""),
  );
}

function traced(characters: number): string {
  let body = "";
  for (let index = 0; body.length < characters; index += 1) {
    body += `<path d="${blob(200, 50 + random() * 400, 50 + random() * 400, 10 + random() * 40)}" fill="${hex(index)}"/>`;
  }
  return logo(body);
}

function gradientsUnderClips(): string {
  let definitions = "";
  for (let index = 0; index < 10; index += 1) {
    definitions += `<linearGradient id="g${String(index)}" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="0.5" stop-color="#0f0"/><stop offset="1" stop-color="#00f"/></linearGradient>`;
  }
  for (let index = 0; index < 6; index += 1) {
    definitions += `<clipPath id="c${String(index)}"><path d="${blob(30, 256, 256, 200 - index * 20)}"/></clipPath>`;
  }
  let body = "";
  for (let index = 0; index < 6; index += 1) {
    const paths = Array.from(
      { length: 5 },
      (_, inner) =>
        `<path d="${blob(30, 256 + inner * 5, 256, 220)}" fill="url(#g${String((index + inner) % 10)})" opacity="0.8"/>`,
    );
    body += `<g clip-path="url(#c${String(index)})">${paths.join("")}</g>`;
  }
  return logo(body, definitions);
}

function pattern(cubics: number): string {
  const symbol = `<path id="s" d="${blob(cubics, 10, 10, 8)}" fill="#0a7" stroke="#063" stroke-width="0.5"/>`;
  let body = "";
  for (let index = 0; index < 300; index += 1) {
    body += `<use href="#s" x="${String((index % 20) * 25)}" y="${String(Math.floor(index / 20) * 25)}"/>`;
  }
  return logo(body, symbol);
}

function dashedRings(dash: string): string {
  return logo(
    Array.from(
      { length: 10 },
      (_, index) =>
        `<circle cx="256" cy="256" r="${String(240 - index * 20)}" fill="none" stroke="#333" stroke-dasharray="${dash}"/>`,
    ).join(""),
  );
}

function figmaMasks(): string {
  let definitions =
    '<linearGradient id="lg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>';
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    definitions += `<mask id="m${String(index)}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><path d="${blob(16, 256, 256, 200 - index * 10)}" fill="#C4C4C4"/></mask>`;
    body += `<g mask="url(#m${String(index)})"><rect width="512" height="512" fill="${hex(index)}"/><path d="${blob(40, 200, 200, 150)}" fill="url(#lg)" opacity="0.6"/></g>`;
  }
  return logo(body, definitions);
}

/** Each logo with the most of each budget, in percent, it may use. */
const REALISTIC: readonly (readonly [string, string, number, number])[] = [
  ["an emblem of 4,000 cubics, filled and stroked", emblem(40, 6), 21, 4],
  ["an emblem of 8,000 cubics, filled and stroked", emblem(80, 3), 42, 8],
  ["traced artwork of 470 KB", traced(470_000), 61, 1],
  [
    "a wordmark of 20 glyphs",
    logo(
      Array.from(
        { length: 20 },
        (_, index) => `<path d="${blob(40, 20 + index * 24, 256, 11)}" fill="#111"/>`,
      ).join(""),
    ),
    5,
    1,
  ],
  ["10 gradients under 6 clip paths", gradientsUnderClips(), 8, 60],
  ["300 uses of a 20-cubic symbol", pattern(20), 36, 1],
  ["300 uses of a 60-cubic symbol", pattern(60), 96, 1],
  ["dashed rings", dashedRings("1 2"), 2, 1],
  ["finely dashed rings", dashedRings("0.25 0.5"), 7, 1],
  ["a Figma export with 8 alpha masks", figmaMasks(), 4, 60],
];

describe("realistic logos", () => {
  it.each(REALISTIC)(
    "accepts %s within both budgets",
    (_label, svg, costPercent, overdrawPercent) => {
      expect(svg.length).toBeLessThanOrEqual(SVG_LOGO_LIMITS.inputBytes);
      const result = sanitiseSvgLogo(svg);
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.drawingCost).toBeLessThanOrEqual(
        (SVG_LOGO_LIMITS.drawingCost * costPercent) / 100,
      );
      expect(result.overdraw).toBeLessThanOrEqual(
        (SVG_LOGO_LIMITS.overdraw * overdrawPercent) / 100,
      );
    },
  );
});
