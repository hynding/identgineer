import { buildBootstrapFiles, integrityOf } from "./bootstrap-files.ts";

export interface BootstrapScriptAttributes {
  readonly src: string;
  readonly integrity: string;
}

// eslint-disable-next-line no-control-regex -- control characters are what is being rejected
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function assertSameOriginPath(src: unknown): asserts src is string {
  if (typeof src !== "string") {
    throw new TypeError(`The bootstrap script src must be a string, got ${typeof src}`);
  }
  const shown = JSON.stringify(src);
  if (CONTROL_CHARACTER.test(src)) {
    throw new Error(`The bootstrap script src ${shown} contains a control character`);
  }
  if (src.includes("\\")) {
    throw new Error(`The bootstrap script src ${shown} contains a backslash`);
  }
  if (!src.startsWith("/")) {
    throw new Error(
      `The bootstrap script src must start with a single "/" (a same-origin path, as script-src 'self' requires), got ${shown}`,
    );
  }
  if (src.includes("//")) {
    throw new Error(
      `The bootstrap script src ${shown} contains "//", which can name another origin; use a same-origin path`,
    );
  }
}

/**
 * The attributes for `<script src integrity>`. The integrity is computed from this package's
 * source, not read from a file: the file you serve must be the `dist/bootstrap.js` built from the
 * same version, or the browser will refuse it. `src` must be a same-origin path, since the script
 * is meant to run under `script-src 'self'`.
 *
 * Node-only (it hashes), so it is a separate entry point from the browser runtime.
 */
export function bootstrapScriptAttributes(src: string): BootstrapScriptAttributes {
  assertSameOriginPath(src);
  const script = buildBootstrapFiles()["bootstrap.js"];
  if (script === undefined) throw new Error("The bootstrap build produced no script");
  return { src, integrity: integrityOf(script) };
}
