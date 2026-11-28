import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readComponentDocs, type ComponentDoc } from "./component-docs.ts";

/** The components package's `docs.json`: a build output of that package, Stencil's `docs-json`. */
export const DOCS_JSON = fileURLToPath(
  new URL("../../../../packages/components/dist/docs.json", import.meta.url),
);

/** The documented components of a `docs.json` file, or an error that says what to do about it. */
export function readDocsFile(file: string = DOCS_JSON): readonly ComponentDoc[] {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `${file} is missing. It is written by the components package's build: run pnpm --filter @identgineer/components build first.`,
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error(`${file} is not JSON`);
  }
  return readComponentDocs(input);
}
