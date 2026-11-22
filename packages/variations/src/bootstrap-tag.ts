import { buildBootstrapFiles, integrityOf } from "./bootstrap-files.ts";

export interface BootstrapScriptAttributes {
  readonly src: string;
  readonly integrity: string;
}

/**
 * The attributes for `<script src integrity>`, computed from the same source the build writes, so
 * they match `dist/bootstrap.js` without reading it. Node-only (it hashes), so it is a separate
 * entry point from the browser runtime.
 */
export function bootstrapScriptAttributes(src: string): BootstrapScriptAttributes {
  const script = buildBootstrapFiles()["bootstrap.js"];
  if (script === undefined) throw new Error("The bootstrap build produced no script");
  return { src, integrity: integrityOf(script) };
}
