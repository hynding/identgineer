/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
import type { SwatchScheme } from "../brand-swatches/brand-swatches-model";

export interface SourceColour {
  readonly role: "primary" | "secondary" | "neutralTint";
  readonly value: string;
}

export interface GuideBacking {
  readonly scheme: SwatchScheme;
  readonly background: string;
  readonly text: string;
  readonly accent: string;
  readonly onAccent: string;
}

export interface GuideGradient {
  readonly scheme: SwatchScheme;
  readonly stops: readonly { readonly colour: string; readonly percent: number }[];
  /** A `linear-gradient()` built from the validated stops and nothing else. */
  readonly value: string;
}

export interface GuideCorner {
  readonly name: "sm" | "md" | "lg" | "pill";
  readonly value: string;
}

export function readName(_kit: unknown): string {
  return "?";
}

export function readTagline(_kit: unknown): string {
  return "?";
}

export function readImage(_kit: unknown, _field: "logo" | "mark"): string | undefined {
  return "?";
}

export function readSourceColours(_kit: unknown): SourceColour[] {
  return [];
}

export function readBackings(_theme: unknown): GuideBacking[] {
  return [];
}

export function readGradients(_theme: unknown): GuideGradient[] {
  return [];
}

export function readCorners(
  _kit: unknown,
  _theme: unknown,
): { style: "sharp" | "soft" | "round" | undefined; radii: GuideCorner[] } {
  return { style: undefined, radii: [] };
}

export function readTone(_kit: unknown): "calm" | "balanced" | "vivid" | undefined {
  return undefined;
}
