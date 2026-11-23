/**
 * Runs an action of the consent object the page gave, which may throw or answer with something
 * that is no boolean: only a plain `true` counts as done, and nothing it does reaches the page as
 * an exception.
 */
export function attempt(action: () => boolean): boolean {
  try {
    const result: unknown = action();
    return result === true;
  } catch {
    return false;
  }
}
