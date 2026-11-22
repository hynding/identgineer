import type { Scheme } from "@identgineer/tokens";
import { CONTRAST_PAIRS } from "@identgineer/tokens/theme-pipeline";
import { adjustLightness } from "./adjust-lightness.ts";
import type { BrandKit } from "./brand-kit.ts";
import { contrastBetween } from "./contrast.ts";
import { fromOklch, mapToSrgbGamut, toOklab, toOklch, type Oklch } from "./oklch.ts";
import { formatHexColor, type Rgb } from "./srgb.ts";
import { TONE_SETTINGS, type ToneSettings } from "./tone-settings.ts";

/** One colour the generator had to move to pass a contrast check. Roles are full token paths. */
export interface BrandAdjustment {
  readonly scheme: Scheme;
  readonly token: string;
  /** `primary` and `secondary` are the kit's own colours; `generated` starts from the generator. */
  readonly origin: "primary" | "secondary" | "generated";
  readonly requested: string;
  readonly used: string;
  /** The background whose check bound the move, and its threshold. */
  readonly against: string;
  readonly minimum: number;
  readonly contrastBefore: number;
  readonly contrastAfter: number;
}

/**
 * Something the generator could not or should not change but a brand guide should show. Today one
 * kind: a status colour so close to the accent (OKLab distance below `STATUS_NEAR_ACCENT`) that,
 * for example, a primary and a danger button look alike.
 */
export interface BrandNote {
  readonly scheme: Scheme;
  readonly kind: "status-near-accent";
  readonly token: string;
  readonly against: string;
  /** Euclidean distance in OKLab; 0.02 is about the smallest visible difference. */
  readonly distance: number;
}

export const STATUS_NEAR_ACCENT = 0.08;

export interface SchemePalette {
  /** Colours by role, without the `color.` prefix. */
  readonly colors: ReadonlyMap<string, Rgb>;
  readonly gradient: readonly [Rgb, Rgb];
  readonly adjustments: readonly BrandAdjustment[];
  readonly notes: readonly BrandNote[];
}

interface Requirement {
  readonly background: string;
  readonly minimum: number;
}

type Origin = BrandAdjustment["origin"];

const PAGE = ["bg", "bg-subtle", "surface", "surface-raised"] as const;

const onPage = (minimum: number, backgrounds: readonly string[]): Requirement[] =>
  backgrounds.map((background) => ({ background, minimum }));

// Checks beyond the tokens suite: every pairing the components draw that all built-in themes meet,
// at its WCAG level (text 4.5, indicators 3), so a generated theme is never weaker than they are.
const EXTRA_REQUIREMENTS: Readonly<Record<string, readonly Requirement[]>> = {
  text: onPage(4.5, ["bg-subtle", "accent-subtle"]),
  "text-muted": onPage(4.5, ["bg-subtle", "surface-raised", "accent-subtle"]),
  link: onPage(4.5, ["bg-subtle", "surface", "surface-raised", "accent-subtle"]),
  "on-accent-subtle": onPage(4.5, PAGE),
  "focus-ring": onPage(3, ["bg-subtle", "surface", "surface-raised", "accent-subtle"]),
  "border-strong": onPage(3, ["surface", "surface-raised"]),
};

/**
 * Fills that also mark state on the page (a primary button, a checked control, progress, an error
 * border) must stand out from every background at the non-text level, 3:1. Warning is left out:
 * the built-in themes do not give amber 3:1 on a light page either.
 */
const FILLS_ON_PAGE: readonly string[] = ["accent", "danger", "success", "info"];

/** Body text is held to AAA (7:1) on every surface, whatever the tone. */
const TEXT_FLOOR = 7;

const STATUSES = [
  { name: "success", hue: 150, chroma: 0.15, lightness: { light: 0.5, dark: 0.78 } },
  { name: "warning", hue: 75, chroma: 0.16, lightness: { light: 0.8, dark: 0.82 } },
  { name: "danger", hue: 27, chroma: 0.19, lightness: { light: 0.55, dark: 0.7 } },
  { name: "info", hue: 255, chroma: 0.15, lightness: { light: 0.55, dark: 0.74 } },
] as const;

const NEUTRAL_LIGHTNESS = {
  light: { bg: 0.985, "bg-subtle": 0.955, surface: 0.998, "surface-raised": 0.998, border: 0.9 },
  dark: { bg: 0.17, "bg-subtle": 0.2, surface: 0.22, "surface-raised": 0.26, border: 0.34 },
} as const;

// How much of the neutral chroma each neutral takes: light cards stay near white, dark ones keep
// the tint so they do not read as a different grey from the page.
const NEUTRAL_TINT = {
  light: { bg: 0.6, "bg-subtle": 1, surface: 0.25, "surface-raised": 0.25, border: 1.2 },
  dark: { bg: 1, "bg-subtle": 1, surface: 1, "surface-raised": 1, border: 1.2 },
} as const;

/** Below this chroma a colour's hue does not show: its gradient turns in lightness instead. */
const GREY_CHROMA = 0.02;

/** Below this chroma a colour is treated as grey: its tints stay grey too. */
const FULL_CHROMA = 0.05;

/** Hover colours to try, best first: the full step away from the text, then the other way and smaller. */
function hoverCandidates(fill: Oklch, away: number, step: number): Rgb[] {
  const lightness = (factor: number) =>
    fromOklch({ ...fill, lightness: Math.min(1, Math.max(0, fill.lightness + factor * step)) });
  const chroma = (factor: number) =>
    fromOklch(mapToSrgbGamut({ ...fill, chroma: fill.chroma * factor }));
  return [
    lightness(away),
    lightness(-away),
    lightness(away * 1.5),
    lightness(away / 2),
    lightness(-away / 2),
    lightness(away / 4),
    lightness(-away / 4),
    chroma(0.6),
    chroma(1.4),
  ];
}

/** A last, fine sweep in lightness both ways, nearest first, before giving up on a change. */
function fineCandidates(fill: Oklch, step: number): Rgb[] {
  const candidates: Rgb[] = [];
  for (let offset = 0.005; offset <= step * 2; offset += 0.005) {
    for (const sign of [-1, 1]) {
      const lightness = fill.lightness + sign * offset;
      if (lightness >= 0 && lightness <= 1) candidates.push(fromOklch({ ...fill, lightness }));
    }
  }
  return candidates;
}

class Builder {
  readonly colors = new Map<string, Rgb>();
  readonly adjustments: BrandAdjustment[] = [];

  readonly scheme: Scheme;
  readonly tone: ToneSettings;

  constructor(scheme: Scheme, tone: ToneSettings) {
    this.scheme = scheme;
    this.tone = tone;
  }

  get away(): "darker" | "lighter" {
    return this.scheme === "light" ? "darker" : "lighter";
  }

  set(role: string, rgb: Rgb): Rgb {
    this.colors.set(role, rgb);
    return rgb;
  }

  color(role: string): Rgb {
    const rgb = this.colors.get(role);
    if (!rgb) throw new Error(`brand palette: "${role}" is needed before it is generated`);
    return rgb;
  }

  requirementsFor(role: string): Requirement[] {
    const suite = CONTRAST_PAIRS.filter((pair) => pair.foreground === role).map((pair) => ({
      background: pair.background,
      minimum: role === "text" ? Math.max(pair.minimum, TEXT_FLOOR) : pair.minimum,
    }));
    return [...suite, ...(EXTRA_REQUIREMENTS[role] ?? [])];
  }

  /** A foreground role, moved away from its backgrounds until every requirement passes. */
  foreground(role: string, start: Oklch, origin: Origin, requested = fromOklch(start)): Rgb {
    const requirements = this.requirementsFor(role).map((requirement) => ({
      ...requirement,
      rgb: this.color(requirement.background),
    }));
    const passes = (rgb: Rgb) =>
      requirements.every((entry) => contrastBetween(rgb, entry.rgb) >= entry.minimum);
    const used = passes(requested)
      ? requested
      : (adjustLightness(start, this.away, passes) ??
        fromOklch({ ...start, lightness: this.away === "darker" ? 0 : 1 }));
    if (!sameColor(used, requested)) {
      const binding = requirements.reduce((worst, entry) =>
        contrastBetween(requested, entry.rgb) / entry.minimum <
        contrastBetween(requested, worst.rgb) / worst.minimum
          ? entry
          : worst,
      );
      this.report(role, origin, requested, used, binding.background, binding.minimum);
    }
    return this.set(role, used);
  }

  /**
   * A fill with text on it (the accent, a status colour). The text is near-white or near-black,
   * whichever the fill already carries best; a fill that also marks state must stand out from the
   * page as well. Only when no text colour works is the fill moved: the shortest way in lightness
   * that satisfies both, with either text colour.
   */
  fill(role: string, onRole: string, requested: Rgb, origin: Origin): { fill: Rgb; on: Rgb } {
    const start = toOklch(requested);
    const minimum = this.minimumBetween(onRole, role);
    const onLight: Rgb = [255, 255, 255];
    const onDark = fromOklch({
      lightness: 0.2,
      chroma: Math.min(0.03, start.chroma),
      hue: start.hue,
    });
    const page = FILLS_ON_PAGE.includes(role)
      ? PAGE.map((background) => ({ background, minimum: 3, rgb: this.color(background) }))
      : [];
    const passesWith = (on: Rgb) => (rgb: Rgb) =>
      contrastBetween(rgb, on) >= minimum &&
      page.every((entry) => contrastBetween(rgb, entry.rgb) >= entry.minimum);
    const keep = [onLight, onDark]
      .filter((on) => passesWith(on)(requested))
      .sort((a, b) => contrastBetween(requested, b) - contrastBetween(requested, a));
    if (keep[0]) {
      this.set(onRole, keep[0]);
      return { fill: this.set(role, requested), on: keep[0] };
    }
    const options = [
      [onLight, "darker"],
      [onDark, "lighter"],
      [onDark, "darker"],
      [onLight, "lighter"],
    ] as const;
    let best: { fill: Rgb; on: Rgb; move: number } | undefined;
    for (const [on, direction] of options) {
      const found = adjustLightness(start, direction, passesWith(on), best?.move ?? 1);
      const move = found && Math.abs(toOklch(found).lightness - start.lightness);
      if (found && move !== undefined && (!best || move < best.move))
        best = { fill: found, on, move };
    }
    // Black under white text, or white under dark text, always passes, so `best` is always set.
    const chosen = best ?? {
      fill: this.scheme === "light" ? ([0, 0, 0] as Rgb) : onLight,
      on: this.scheme === "light" ? onLight : onDark,
    };
    this.set(onRole, chosen.on);
    const binding = [{ background: onRole, minimum, rgb: chosen.on }, ...page].reduce(
      (worst, entry) =>
        contrastBetween(requested, entry.rgb) / entry.minimum <
        contrastBetween(requested, worst.rgb) / worst.minimum
          ? entry
          : worst,
    );
    this.report(role, origin, requested, chosen.fill, binding.background, binding.minimum);
    return { fill: this.set(role, chosen.fill), on: chosen.on };
  }

  /**
   * The hover state of a fill: a step away from its text, keeping the text passing and never
   * weaker against the page than the fill itself. When that step would move towards the page, a
   * step the other way, a smaller step or a change of chroma is taken instead; only when no
   * different colour qualifies (a white or black fill already at the end of its range) does the
   * hover keep the fill's own colour.
   */
  hover(role: string, fillRole: string, onRole: string): void {
    const fillRgb = this.color(fillRole);
    const fill = toOklch(fillRgb);
    const on = this.color(onRole);
    const minimum = this.minimumBetween(onRole, role);
    const onPage = FILLS_ON_PAGE.includes(fillRole);
    const floor = onPage ? this.weakestOnPage(fillRgb) : 0;
    const qualifies = (rgb: Rgb) =>
      !sameColor(rgb, fillRgb) &&
      contrastBetween(rgb, on) >= minimum &&
      (!onPage || this.weakestOnPage(rgb) >= floor);
    const away = toOklch(on).lightness > fill.lightness ? -1 : 1;
    const step = this.tone.hoverStep;
    const requested = fromOklch({ ...fill, lightness: fill.lightness + away * step });
    const used =
      hoverCandidates(fill, away, step).find(qualifies) ??
      fineCandidates(fill, step).find(qualifies) ??
      fillRgb;
    if (!sameColor(used, requested))
      this.reportHover(role, requested, used, onRole, minimum, floor);
    this.set(role, used);
  }

  // Names what the full step failed: the text, or the page background it came too close to.
  reportHover(
    role: string,
    requested: Rgb,
    used: Rgb,
    onRole: string,
    minimum: number,
    floor: number,
  ) {
    if (contrastBetween(requested, this.color(onRole)) < minimum) {
      this.report(role, "generated", requested, used, onRole, minimum);
      return;
    }
    const weakest = PAGE.find(
      (background) => contrastBetween(requested, this.color(background)) < floor,
    );
    if (weakest !== undefined) this.report(role, "generated", requested, used, weakest, floor);
  }

  weakestOnPage(rgb: Rgb): number {
    return Math.min(...PAGE.map((background) => contrastBetween(rgb, this.color(background))));
  }

  minimumBetween(foreground: string, background: string): number {
    const pair = CONTRAST_PAIRS.find(
      (candidate) => candidate.foreground === foreground && candidate.background === background,
    );
    return pair?.minimum ?? 4.5;
  }

  report(
    role: string,
    origin: Origin,
    requested: Rgb,
    used: Rgb,
    against: string,
    minimum: number,
  ) {
    const background = this.color(against);
    this.adjustments.push({
      scheme: this.scheme,
      token: `color.${role}`,
      origin,
      requested: formatHexColor(requested),
      used: formatHexColor(used),
      against: `color.${against}`,
      minimum,
      contrastBefore: contrastBetween(requested, background),
      contrastAfter: contrastBetween(used, background),
    });
  }
}

function sameColor(first: Rgb, second: Rgb): boolean {
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2];
}

/** How strongly a colour's hue may tint: full for saturated colours, fading to none for greys. */
function tintStrength(color: Oklch): number {
  return Math.min(1, color.chroma / FULL_CHROMA);
}

function neutrals(builder: Builder, kit: BrandKit): Oklch {
  const source = toOklch(kit.colors.neutralTint ?? kit.colors.primary);
  const chroma = builder.tone.neutralChroma * tintStrength(source);
  const neutral = { lightness: 0, chroma, hue: source.hue };
  const levels = NEUTRAL_LIGHTNESS[builder.scheme];
  const tint = NEUTRAL_TINT[builder.scheme];
  for (const role of ["bg", "bg-subtle", "surface", "surface-raised", "border"] as const) {
    builder.set(
      role,
      fromOklch({ ...neutral, lightness: levels[role], chroma: chroma * tint[role] }),
    );
  }
  return neutral;
}

function text(builder: Builder, neutral: Oklch): void {
  const { scheme, tone } = builder;
  const chroma = neutral.chroma * 1.5;
  builder.foreground("text", { ...neutral, chroma, lightness: tone.text[scheme] }, "generated");
  builder.foreground(
    "text-muted",
    { ...neutral, chroma, lightness: tone.mutedText[scheme] },
    "generated",
  );
  builder.foreground(
    "border-strong",
    { ...neutral, chroma: chroma * 2, lightness: tone.strongBorder[scheme] },
    "generated",
  );
}

/** Tinted backgrounds first: text, links and the focus ring are checked on them too. */
function subtleBackgrounds(builder: Builder, kit: BrandKit): void {
  const lightness = builder.tone.subtle[builder.scheme];
  for (const { role, hue, chroma } of subtleTints(builder, kit)) {
    builder.set(`${role}-subtle`, fromOklch({ lightness, chroma, hue }));
  }
}

function subtleTints(builder: Builder, kit: BrandKit) {
  const primary = toOklch(kit.colors.primary);
  const statusChroma = (builder.scheme === "light" ? 0.045 : 0.06) * builder.tone.chroma;
  return [
    {
      role: "accent",
      hue: primary.hue,
      chroma: Math.min(primary.chroma, 0.05) * builder.tone.chroma,
    },
    ...STATUSES.map((status) => ({ role: status.name, hue: status.hue, chroma: statusChroma })),
  ];
}

function onSubtle(builder: Builder, kit: BrandKit): void {
  const light = builder.scheme === "light";
  for (const { role, hue, chroma } of subtleTints(builder, kit)) {
    builder.foreground(
      `on-${role}-subtle`,
      { lightness: light ? 0.38 : 0.88, chroma: chroma * 2, hue },
      "generated",
    );
  }
}

function accent(builder: Builder, kit: BrandKit): void {
  const primary = toOklch(kit.colors.primary);
  builder.fill("accent", "on-accent", kit.colors.primary, "primary");
  builder.hover("accent-hover", "accent", "on-accent");
  builder.foreground("link", primary, "primary", kit.colors.primary);
  const ring = kit.colors.secondary ?? kit.colors.primary;
  builder.foreground(
    "focus-ring",
    toOklch(ring),
    kit.colors.secondary ? "secondary" : "primary",
    ring,
  );
}

function statuses(builder: Builder): void {
  const { scheme, tone } = builder;
  for (const status of STATUSES) {
    const requested = fromOklch({
      lightness: status.lightness[scheme],
      chroma: status.chroma * tone.chroma,
      hue: status.hue,
    });
    builder.fill(status.name, `on-${status.name}`, requested, "generated");
  }
}

function oklabDistance(first: Rgb, second: Rgb): number {
  const a = toOklab(first);
  const b = toOklab(second);
  return Math.hypot(a.lightness - b.lightness, a.a - b.a, a.b - b.b);
}

function notes(builder: Builder): BrandNote[] {
  const accent = builder.color("accent");
  return STATUSES.flatMap((status): BrandNote[] => {
    const distance = oklabDistance(builder.color(status.name), accent);
    return distance < STATUS_NEAR_ACCENT
      ? [
          {
            scheme: builder.scheme,
            kind: "status-near-accent",
            token: `color.${status.name}`,
            against: "color.accent",
            distance,
          },
        ]
      : [];
  });
}

// Analogous turns tried for the gradient's far end, nearest first.
const GRADIENT_TURNS = [30, -30, 40, -40] as const;
const GREY_STEP = 0.12;

/**
 * Where the brand gradient ends without a secondary: the analogous hue (turned 30 or 40 degrees,
 * either way) that keeps the most chroma at the primary's lightness once mapped into sRGB, so it
 * never lands on a hue the gamut can only show muddy there. A grey turns in lightness instead,
 * towards the middle.
 */
function gradientPartner(primary: Rgb): Rgb {
  const start = toOklch(primary);
  if (start.chroma < GREY_CHROMA) {
    const step = start.lightness > 0.5 ? -GREY_STEP : GREY_STEP;
    return fromOklch({ ...start, lightness: start.lightness + step });
  }
  const candidates = GRADIENT_TURNS.map((turn) =>
    mapToSrgbGamut({ ...start, hue: (start.hue + turn + 360) % 360 }),
  );
  const best = candidates.reduce((most, candidate) =>
    candidate.chroma > most.chroma + 1e-9 ? candidate : most,
  );
  return fromOklch(best);
}

/** The primary itself, as the brand gave it, to the secondary or an analogous partner. */
function gradient(kit: BrandKit): readonly [Rgb, Rgb] {
  return [kit.colors.primary, kit.colors.secondary ?? gradientPartner(kit.colors.primary)];
}

/** Every theme-owned colour for one scheme, derived from the kit; see the README for the method. */
export function generatePalette(kit: BrandKit, scheme: Scheme): SchemePalette {
  const builder = new Builder(scheme, TONE_SETTINGS[kit.tone]);
  const neutral = neutrals(builder, kit);
  subtleBackgrounds(builder, kit);
  text(builder, neutral);
  accent(builder, kit);
  statuses(builder);
  onSubtle(builder, kit);
  return {
    colors: builder.colors,
    gradient: gradient(kit),
    adjustments: builder.adjustments,
    notes: notes(builder),
  };
}
