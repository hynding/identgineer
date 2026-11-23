// Control and format characters, any space or separator (U+2028 and U+2029 among them), and
// backslashes, which some browsers read as slashes.
const UNSAFE_CHARACTER = /[\p{Cc}\p{Cf}\p{Z}\\]/u;
const ENCODED_SEPARATOR = /%(2f|5c)/i;
const PROBE_ORIGIN = "https://identgineer.invalid";

const isSafe = (path: string): boolean => {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (UNSAFE_CHARACTER.test(path) || ENCODED_SEPARATOR.test(path)) return false;
  return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
};

/**
 * Where to send the browser after a sign-in: the given path if it is a same-origin relative path,
 * otherwise the fallback (itself checked) or `/`.
 */
export const safeRedirectPath = (path: string | undefined, fallback = "/"): string => {
  if (path !== undefined && isSafe(path)) return path;
  return isSafe(fallback) ? fallback : "/";
};
