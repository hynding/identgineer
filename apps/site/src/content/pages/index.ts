import type { ContentPage } from "../content-page";
import { DOCS } from "./docs";
import { FEATURES } from "./features";
import { GETTING_STARTED } from "./getting-started";
import { IDENTITY } from "./identity";
import { SECURITY } from "./security";
import { THEMING } from "./theming";
import { TRACKING } from "./tracking";

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
