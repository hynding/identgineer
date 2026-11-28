import { isComponentPath, livePaths } from "../routes.ts";
import { parseContentPage, type ContentResult } from "./validate-content-page.ts";

/**
 * A content page from the JSON the prerenderer put in the page's attribute, checked against the
 * site's live paths as it was at build time, so the browser draws exactly what was prerendered.
 * The pages of the components are known by their path alone: only the build has the list.
 */
export function readContentPage(json: string): ContentResult {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    return { ok: false, error: { path: "", message: "is not JSON" } };
  }
  return parseContentPage(input, { paths: livePaths(), accepts: isComponentPath });
}
