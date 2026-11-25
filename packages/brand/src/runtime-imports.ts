import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";

const IMPORT_SPECIFIER = /(?:from|import)\s+["']([^"']+)["']/g;

/** What a module graph loads at run time: its files, and the packages it names but does not follow. */
export interface RuntimeImports {
  readonly files: Set<string>;
  readonly packages: Set<string>;
}

/**
 * Every module `entry` loads at run time, by its import specifiers, with type-only imports left
 * out. A package specifier is followed when `follow` gives its file (the way a test lets the graph
 * of a workspace package join the walk), and is otherwise reported in `packages`. JSON files are
 * counted as loaded and not read for imports.
 */
export function runtimeImports(
  entry: string,
  follow: (specifier: string) => string | undefined = () => undefined,
): RuntimeImports {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    if (file.endsWith(".json")) continue;
    const code = readFileSync(file, "utf8")
      .replace(/import type [^;]*;/g, "")
      .replace(/export type [^;]*;/g, "");
    for (const match of code.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier));
      else {
        const followed = follow(specifier);
        if (followed === undefined) packages.add(specifier);
        else pending.push(followed);
      }
    }
  }
  return { files, packages };
}

/** Whether a specifier names a Node built-in module, with or without the `node:` prefix. */
export function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier);
}
