import { fileURLToPath } from "node:url";

/**
 * `URL.pathname` keeps percent-encoding, so in a checkout whose path has a space it names a file
 * that does not exist; Prettier then misses its config and the generated file differs.
 */
export function toFilePath(file: URL): string {
  return fileURLToPath(file);
}
