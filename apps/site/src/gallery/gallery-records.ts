import {
  AXES,
  REGISTRY,
  URL_PARAM_PREFIX,
  encodeVariations,
  type VariationAxis,
  type VariationState,
  type VariationsRegistry,
} from "@identgineer/variations";
import { printable } from "../content/validate-content-page.ts";

/** The gallery's own path: a tile's link is this page with a choice in the query. */
const GALLERY_PATH = "/variations/";

/** The id of the section of the curated combinations, which its links return to. */
export const COMBINE_ID = "combine";

/** One value of an axis: what a tile shows and where it leads. */
export interface GalleryTile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** The gallery with this value chosen, in the query the bootstrap script reads. */
  readonly href: string;
  readonly isDefault: boolean;
}

/** One axis: a heading, the attribute that scopes it and a tile for each of its values. */
export interface GallerySection {
  readonly axis: VariationAxis;
  readonly id: string;
  readonly title: string;
  readonly noun: string;
  /** The attribute a tile puts on its preview, so that preview is drawn under its value. */
  readonly attribute: string;
  readonly tiles: readonly GalleryTile[];
}

const SECTION_TEXT: Readonly<
  Record<VariationAxis, { readonly id: string; readonly title: string; readonly noun: string }>
> = {
  theme: { id: "themes", title: "Themes", noun: "theme" },
  design: { id: "designs", title: "Designs", noun: "design" },
  layout: { id: "layouts", title: "Layouts", noun: "layout" },
  ux: { id: "ux-modes", title: "UX modes", noun: "UX mode" },
};

/** What an id is made of in every registry the project has, and so what may be written as it is. */
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function tileOf(
  axis: VariationAxis,
  id: string,
  label: string,
  description: string,
  defaultId: string,
  section: string,
): GalleryTile {
  if (!SAFE_ID.test(id)) {
    throw new Error(
      `The ${axis} "${printable(id, 40)}" has an id that is not lower-case words joined by hyphens, so it cannot be written into a link or an attribute`,
    );
  }
  return {
    id,
    label,
    description,
    href: `${GALLERY_PATH}?${URL_PARAM_PREFIX}${axis}=${id}#${section}`,
    isDefault: id === defaultId,
  };
}

/**
 * The gallery's sections, made from the registries: a section for each axis and a tile for each of
 * its values, in the registry's order, so a value a registry gains is drawn with no change here.
 */
export function galleryRecords(registry: VariationsRegistry = REGISTRY): readonly GallerySection[] {
  return AXES.map((axis): GallerySection => {
    const { id, title, noun } = SECTION_TEXT[axis];
    const { attribute, defaultId, variations } = registry[axis];
    return {
      axis,
      id,
      title,
      noun,
      attribute,
      tiles: variations.map((value) =>
        tileOf(axis, value.id, value.label, value.description, defaultId, id),
      ),
    };
  });
}

/** A look worth trying: a value of each axis, and why they go together. */
export interface Combination {
  readonly label: string;
  readonly description: string;
  readonly state: Pick<VariationState, VariationAxis>;
}

export const COMBINATIONS: readonly Combination[] = [
  {
    label: "The morning paper",
    description: "Paper, editorial rules and a magazine's columns, with calm motion.",
    state: { theme: "paper", design: "editorial", layout: "magazine", ux: "calm" },
  },
  {
    label: "Mission control",
    description: "Terminal green, outlined panels, a dense dashboard and every shortcut shown.",
    state: { theme: "terminal", design: "outline", layout: "dashboard", ux: "power" },
  },
  {
    label: "Sunday market",
    description: "Citrus on soft surfaces in a bento of tiles, springy and playful.",
    state: { theme: "citrus", design: "soft", layout: "bento", ux: "playful" },
  },
  {
    label: "Quiet studio",
    description: "Tidal blue-green on glass, one centred column and room to breathe.",
    state: { theme: "tidal", design: "glass", layout: "centered", ux: "spacious" },
  },
  {
    label: "Blueprint",
    description: "Graphite and a single blue, brutalist borders and a rail of navigation.",
    state: { theme: "graphite", design: "brutalist", layout: "side-rail", ux: "compact" },
  },
  {
    label: "Arcade",
    description: "Orchid and pixel corners across full-width bands, guided at each step.",
    state: { theme: "orchid", design: "pixel", layout: "immersive", ux: "guided" },
  },
];

/** A combination with the link that applies it. */
export interface CombinationRecord extends Combination {
  readonly href: string;
}

/** The combinations as links to the gallery with all four choices, and the scheme left alone. */
export function combinationRecords(): readonly CombinationRecord[] {
  return COMBINATIONS.map((combination) => ({
    ...combination,
    href: `${GALLERY_PATH}?${encodeVariations(combination.state)}#${COMBINE_ID}`,
  }));
}
