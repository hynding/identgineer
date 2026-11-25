/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
export type Artefact = "css" | "tokens" | "snippet";

export const FILE_SLUG_MAX_LENGTH = 40;
export const FALLBACK_SLUG = "brand";

export function fileSlug(name: unknown): string {
  return "";
}

export function artefactFile(
  artefact: "css" | "tokens",
  slug: string,
): { readonly name: string; readonly type: string } {
  return { name: "", type: "" };
}

export function themeIdOf(value: unknown): string | undefined {
  return undefined;
}

export function usageSnippet(id: string, slug: string): string {
  return "";
}
