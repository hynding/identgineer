const WARN_WHEN_REMAINING_AT_MOST = 20;

/**
 * Typing would otherwise be interrupted on every key, so a count is spoken only once the limit is
 * near, reached or passed.
 */
export function characterAnnouncement(length: number, max: number | undefined): string {
  if (max === undefined) return "";
  const remaining = max - length;
  if (remaining > WARN_WHEN_REMAINING_AT_MOST) return "";
  if (remaining === 0) return "Character limit reached";
  if (remaining < 0) {
    const over = -remaining;
    return `${String(over)} ${over === 1 ? "character" : "characters"} over the limit`;
  }
  return `${String(remaining)} ${remaining === 1 ? "character" : "characters"} remaining`;
}
