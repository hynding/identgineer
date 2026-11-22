import type { BrandKit } from "./brand-kit.ts";
import { parseBrandKit } from "./parse-brand-kit.ts";
import { formatHexColor, type Rgb } from "./srgb.ts";

function isRgb(value: unknown): value is Rgb {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (channel: unknown) =>
        typeof channel === "number" && Number.isInteger(channel) && channel >= 0 && channel <= 255,
    )
  );
}

function colorInput(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isRgb(value))
    throw new TypeError(`not a valid brand kit: colors.${field} is not three bytes`);
  return formatHexColor(value);
}

/**
 * Holds a kit that did not come from parseBrandKit (built by hand, or altered since) to the same
 * rules, by reading it again: the generator and emitters never work from an unchecked kit.
 */
export function assertValidKit(kit: BrandKit): void {
  // Typed as a kit, but it may not be one: read it as untrusted data.
  const untrusted: unknown = kit;
  const colors: unknown =
    typeof untrusted === "object" && untrusted !== null && "colors" in untrusted
      ? untrusted.colors
      : undefined;
  if (typeof colors !== "object" || colors === null) {
    throw new TypeError("not a valid brand kit: colors is missing");
  }
  const read = (field: string): string | undefined =>
    colorInput(field in colors ? (colors as Record<string, unknown>)[field] : undefined, field);
  const primary = read("primary");
  const secondary = read("secondary");
  const neutralTint = read("neutralTint");
  const result = parseBrandKit({
    ...kit,
    colors: {
      primary,
      ...(secondary !== undefined && { secondary }),
      ...(neutralTint !== undefined && { neutralTint }),
    },
  });
  if (!result.ok) {
    throw new TypeError(
      `not a valid brand kit: ${result.errors.map((error) => error.message).join("; ")}`,
    );
  }
}
