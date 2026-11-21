/**
 * Text for the hidden twin that sizes an auto-growing textarea where `field-sizing` is missing.
 * The extra newline makes a trailing line break take up a line, as it does in the textarea.
 */
export function growSizerText(value: string, rows: number): string {
  const minimum = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : 1;
  const lines = value.split("\n").length;
  return `${value}${"\n".repeat(Math.max(1, minimum - lines + 1))}`;
}
