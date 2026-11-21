export function headingLevel(level: unknown, fallback: number): number {
  return typeof level === "number" ? fallback : fallback;
}
