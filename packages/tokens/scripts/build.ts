import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokenFiles } from "../src/build-token-files.ts";
import { findContrastFailures, formatContrastFailure } from "../src/check-contrast.ts";
import { flattenTokens } from "../src/flatten-tokens.ts";
import { mergeTokens } from "../src/merge-tokens.ts";
import { parseTheme } from "../src/parse-theme.ts";
import { resolveThemeScheme } from "../src/resolve-theme.ts";
import { SCHEMES } from "../src/scheme.ts";
import { SHARED_SOURCES, THEME_SOURCES, TOKEN_SOURCES } from "../src/theme-sources.ts";
import { findThemeProblems } from "../src/verify-theme.ts";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

function verify(): string[] {
  const shared = mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)));
  const semantic = flattenTokens(
    "tokens/semantic.json",
    SHARED_SOURCES.find(({ file }) => file.endsWith("semantic.json"))?.json,
  );
  return THEME_SOURCES.flatMap((source) => {
    const theme = parseTheme(source);
    const contrast = SCHEMES.flatMap((scheme) => {
      const colors = new Map<string, string>();
      for (const token of resolveThemeScheme(shared, theme, scheme)) {
        if (token.type === "color" && typeof token.value === "string") {
          colors.set(token.path.replace(/^color\./, ""), token.value);
        }
      }
      return findContrastFailures(colors).map((failure) =>
        formatContrastFailure(theme.id, scheme, failure),
      );
    });
    return [...findThemeProblems(theme, semantic), ...contrast];
  });
}

const problems = verify();
if (problems.length > 0) {
  throw new Error(`Token verification failed:\n${problems.map((line) => `  ${line}`).join("\n")}`);
}

const files = buildTokenFiles(TOKEN_SOURCES);
for (const [relative, css] of Object.entries(files)) {
  const target = join(DIST, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, css);
}
console.log(`tokens: wrote ${String(Object.keys(files).length)} files to ${DIST}`);
