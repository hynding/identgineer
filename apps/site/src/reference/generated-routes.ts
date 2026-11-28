import { BUNDLES } from "@identgineer/components/bundles";
import type { ContentRoute } from "../routes.ts";
import { referencePages, type Reference } from "./component-pages.ts";
import { readDocsFile } from "./docs-file.ts";

/** The components' reference as the build makes it, from the package's `docs.json` on disk. */
export function builtReference(): Reference {
  return referencePages(readDocsFile(), BUNDLES);
}

/** The route of each component's page in the build: what the browser suite visits. */
export function generatedRoutes(): readonly ContentRoute[] {
  return builtReference().components.map(({ route }) => route);
}
