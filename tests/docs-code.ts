// Reads the code in a guide's fenced blocks, so the docs tests can hold the examples to what the
// packages really export.

/** The code in fenced blocks, so prose that mentions a name is not mistaken for an import. */
export function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1] ?? "");
}

export interface Import {
  readonly source: string;
  readonly name: string;
  readonly typeOnly: boolean;
}

/** The named imports from `@identgineer/<package>` (and its subpaths) in the guide's code. */
export function importsOf(markdown: string, packages: readonly string[]): Import[] {
  const pattern = new RegExp(
    String.raw`import\s+(type\s+)?\{([^}]*)\}\s+from\s+["'](@identgineer\/(?:${packages.join("|")})[^"']*)["']`,
    "g",
  );
  return codeBlocks(markdown).flatMap((block) =>
    [...block.matchAll(pattern)].flatMap((match) =>
      (match[2] ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .map((entry) => {
          const inline = /^type\s+/.test(entry);
          const name = entry.replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "";
          return { source: match[3] ?? "", name, typeOnly: inline || match[1] !== undefined };
        }),
    ),
  );
}

/** The names in every `pattern` match's comma-separated first group, such as an export list. */
export function namesIn(source: string, pattern: RegExp): Set<string> {
  return new Set(
    [...source.matchAll(pattern)].flatMap((match) =>
      (match[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  );
}
