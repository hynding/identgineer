export const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "number",
  "duration",
  "cubicBezier",
  "shadow",
  "gradient",
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export interface GradientStop {
  readonly color: string;
  readonly position: number;
}

export type TokenValue =
  string | number | readonly string[] | readonly number[] | readonly GradientStop[];

export interface FlatToken {
  /** Dot-separated path, for example `color.bg-subtle`. */
  readonly path: string;
  /** Absent only while an alias still has to inherit the type of its target. */
  readonly type: TokenType | undefined;
  readonly value: TokenValue;
  readonly description: string | undefined;
  /** File the token was authored in; used to locate errors. */
  readonly source: string;
}

export interface ResolvedToken extends FlatToken {
  readonly type: TokenType;
}

export function isTokenType(value: unknown): value is TokenType {
  return TOKEN_TYPES.some((type) => type === value);
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

export function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "number");
}

export function isGradientStopArray(value: unknown): value is readonly GradientStop[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "color" in item &&
        typeof item.color === "string" &&
        "position" in item &&
        typeof item.position === "number",
    )
  );
}
