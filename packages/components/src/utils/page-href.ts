export function pageHref(template: string | undefined, page: number): string | undefined {
  return template === undefined ? undefined : String(page);
}
