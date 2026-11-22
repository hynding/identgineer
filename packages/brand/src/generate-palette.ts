import type { Scheme } from "@identgineer/tokens";
import { CONTRAST_PAIRS } from "@identgineer/tokens/theme-pipeline";
import { adjustLightness } from "./adjust-lightness.ts";
import type { BrandKit } from "./brand-kit.ts";
import { contrastBetween } from "./contrast.ts";
import { fromOklch, toOklch, type Oklch } from "./oklch.ts";
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

export interface SchemePalette {
  /** Colours by role, without the `color.` prefix. */
  readonly colors: ReadonlyMap<string, Rgb>;
  readonly gradient: readonly [Rgb, Rgb];
  readonly adjustments: readonly BrandAdjustment[];
}

interface Requirement {
  readonly background: string;
  readonly minimum: number;
}

type Origin = BrandAdjustment["origin"];

// Checks beyond the tokens suite, which only judges links and the focus ring on the page
// background: both also sit on cards, which in a dark scheme are lighter than the page.
const EXTRA_REQUIREMENTS: Readonly<Record<string, readonly Requirement[]>> = {
  link: [
    { background: "surface", minimum: 4.5 },
    { background: "surface-raised", minimum: 4.5 },
  ],
  "focus-ring": [
    { background: "surface", minimum: 3 },
    { background: "surface-raised", minimum: 3 },
  ],
};

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

/** Below this chroma a colour is treated as grey: its tints stay grey too. */
const FULL_CHROMA = 0.05;

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
    const used = passes(requested) ? requested : adjustLightness(start, this.away, passes);
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
   * A fill with text on it (the accent, a status colour): the text is near-white or near-black,
   * whichever the fill already carries best. Only when it carries neither is the fill moved, the
   * shorter way in lightness.
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
    const light = contrastBetween(requested, onLight);
    const dark = contrastBetween(requested, onDark);
    if (Math.max(light, dark) >= minimum) {
      this.set(onRole, light >= dark ? onLight : onDark);
      return { fill: this.set(role, requested), on: this.color(onRole) };
    }
    const darker = adjustLightness(
      start,
      "darker",
      (rgb) => contrastBetween(rgb, onLight) >= minimum,
    );
    const lighter = adjustLightness(
      start,
      "lighter",
      (rgb) => contrastBetween(rgb, onDark) >= minimum,
    );
    const darkerMove = start.lightness - toOklch(darker).lightness;
    const lighterMove = toOklch(lighter).lightness - start.lightness;
    const [fill, on] = darkerMove <= lighterMove ? [darker, onLight] : [lighter, onDark];
    this.set(onRole, on);
    this.report(role, origin, requested, fill, onRole, minimum);
    return { fill: this.set(role, fill), on };
  }

  /** The hover state of a fill, further from its text so it keeps passing. */
  hover(role: string, fillRole: string, onRole: string): void {
    const fill = toOklch(this.color(fillRole));
    const on = this.color(onRole);
    const minimum = this.minimumBetween(onRole, role);
    const direction = toOklch(on).lightness > fill.lightness ? "darker" : "lighter";
    const step = direction === "darker" ? -this.tone.hoverStep : this.tone.hoverStep;
    const start = { ...fill, lightness: fill.lightness + step };
    const requested = fromOklch(start);
    const used = adjustLightness(start, direction, (rgb) => contrastBetween(rgb, on) >= minimum);
    if (!sameColor(used, requested))
      this.report(role, "generated", requested, used, onRole, minimum);
    this.set(role, used);
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
  const tint = { bg: 0.6, "bg-subtle": 1, surface: 0.25, "surface-raised": 0.25, border: 1.2 };
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

function subtlePair(builder: Builder, role: string, hue: number, chroma: number): void {
  const light = builder.scheme === "light";
  const lightness = builder.tone.subtle[builder.scheme];
  builder.set(`${role}-subtle`, fromOklch({ lightness, chroma, hue }));
  builder.foreground(
    `on-${role}-subtle`,
    { lightness: light ? 0.38 : 0.88, chroma: chroma * 2, hue },
    "generated",
  );
}

function accent(builder: Builder, kit: BrandKit): void {
  const primary = toOklch(kit.colors.primary);
  builder.fill("accent", "on-accent", kit.colors.primary, "primary");
  builder.hover("accent-hover", "accent", "on-accent");
  subtlePair(builder, "accent", primary.hue, Math.min(primary.chroma, 0.05) * builder.tone.chroma);
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
    subtlePair(builder, status.name, status.hue, (scheme === "light" ? 0.045 : 0.06) * tone.chroma);
  }
}

function gradient(builder: Builder, kit: BrandKit): readonly [Rgb, Rgb] {
  if (kit.colors.secondary) return [builder.color("accent"), kit.colors.secondary];
  const primary = toOklch(kit.colors.primary);
  return [builder.color("accent"), fromOklch({ ...primary, hue: (primary.hue + 40) % 360 })];
}

/** Every theme-owned colour for one scheme, derived from the kit; see the README for the method. */
export function generatePalette(kit: BrandKit, scheme: Scheme): SchemePalette {
  const builder = new Builder(scheme, TONE_SETTINGS[kit.tone]);
  const neutral = neutrals(builder, kit);
  text(builder, neutral);
  accent(builder, kit);
  statuses(builder);
  return {
    colors: builder.colors,
    gradient: gradient(builder, kit),
    adjustments: builder.adjustments,
  };
}
