import type { ContentPage } from "../content-page.ts";
import { DOCS } from "./docs.ts";
import { FEATURES } from "./features.ts";
import { GETTING_STARTED } from "./getting-started.ts";
import { IDENTITY } from "./identity.ts";
import { SECURITY } from "./security.ts";
import { THEMING } from "./theming.ts";
import { TRACKING } from "./tracking.ts";

/** The reading pages as the repository has them, in the route table's order. */
export const STATIC_PAGES: readonly ContentPage[] = [
  FEATURES,
  IDENTITY,
  TRACKING,
  DOCS,
  GETTING_STARTED,
  THEMING,
  SECURITY,
];
