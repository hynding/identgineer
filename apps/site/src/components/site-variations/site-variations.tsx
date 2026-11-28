import { Build, Component, Element, Prop, State, h } from "@stencil/core";
import {
  applyVariations,
  getVariations,
  onVariationsChange,
  shuffleVariations,
  type VariationAxis,
  type VariationState,
} from "@identgineer/variations";
import { ContentsNav } from "../../shell/contents-nav";
import { SiteShell } from "../../shell/site-shell";
import { describeChoice, describeLook, labelOf } from "../../shell/appearance";
import { currentMarkerCss } from "../../gallery/current-marker";
import { countsLine } from "../../gallery/gallery-counts";
import { gridCss } from "../../gallery/gallery-grid";
import {
  COMBINE_ID,
  combinationRecords,
  galleryRecords,
  type GallerySection,
  type GalleryTile,
} from "../../gallery/gallery-records";

/** What a tile with the same name in the layout thumbnail is: each is a region of a page. */
const THUMBNAIL_PARTS = ["bar", "rail", "hero", "main", "aside", "foot", "tile"] as const;
const THUMBNAIL_TILES = 6;

/** The most tiles in a list that the grid's rules are written for; a longer list stands in one column. */
const GRID_COUNTS = 24;

const AXES: readonly VariationAxis[] = ["theme", "design", "layout", "ux"];

/** What each axis changes, in a line under its heading. */
const SECTION_SAYS: Readonly<Record<VariationAxis, string>> = {
  theme:
    "Colour and type, in a light and a dark scheme. Each tile shows the theme's heading face and its five colours in both.",
  design:
    "Surfaces, borders, corners and depth. Each tile is a card, two buttons and a progress bar drawn in its own design.",
  layout:
    "Where the page's regions go. Each tile is a wireframe of its layout in the page's colours, not the layout itself.",
  ux: "Density, type scale, motion and hints. Each tile shows its mode's controls, spacing, text, reading width, focus ring, hint and shortcut, and moves its motion when you point at it.",
};

/** The sizes a theme's sample is set in: a heading, a line of text and the theme's colours. */
const SWATCHES = ["bg", "surface", "text", "accent", "accent-subtle"] as const;

/**
 * A theme drawn in both its schemes: a heading in the theme's display face, a line in its body face
 * and the colours it is made of. Each half carries the theme and a scheme of its own, so the page's
 * own scheme choice changes neither.
 */
function ThemeSample({ theme, label }: { readonly theme: string; readonly label: string }) {
  return (
    <div class="theme-sample">
      {(["light", "dark"] as const).map((scheme) => (
        <div class="scheme-half" data-theme={theme} data-scheme={scheme}>
          <p class="sample-heading">{label}</p>
          <p class="sample-text">Body text</p>
          <span class="scheme-swatches">
            {SWATCHES.map((role) => (
              <span class={`scheme-swatch scheme-swatch-${role}`} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The components a design is drawn on: a raised card holding a badge, two buttons and a progress
 * bar, the same in every tile, so what differs between tiles is the design alone.
 */
function Sample() {
  return (
    <idg-card variant="raised" padding="sm">
      <div class="sample">
        <span class="sample-title">Sample</span>
        <idg-badge variant="accent" size="sm">
          Badge
        </idg-badge>
        <idg-button size="sm">Save</idg-button>
        <idg-button size="sm" variant="secondary">
          Cancel
        </idg-button>
        <idg-progress value={64} />
      </div>
    </idg-card>
  );
}

/**
 * What a UX mode sets, as things a still frame shows: the size of its controls and the space
 * between them, its type, the width of a line of text, how heavy its focus ring is, whether it
 * shows a hint and a shortcut, and a dot that travels the way its motion does when the tile is
 * hovered or focused.
 */
function UxSample() {
  return (
    <div class="ux-sample">
      <div class="ux-controls">
        <span class="ux-control">Save</span>
        <span class="ux-control ux-focused">Edit</span>
        <kbd class="ux-kbd">Ctrl K</kbd>
      </div>
      <div class="ux-type">
        Aa <span class="ux-measure" />
      </div>
      <div class="ux-track">
        <span class="ux-dot" />
      </div>
      <p class="ux-hint">Tip: press ? for help</p>
    </div>
  );
}

/**
 * A wireframe of a layout in CSS: its regions as boxes, with the page's brand mark, its navigation
 * and its headings drawn as lines. A layout cannot be scoped to a container, as a theme, a design
 * or a UX mode can, because it is the arrangement of the page's own landmarks, which idg-layout
 * draws once, so the thumbnail is a drawing of it and says so.
 */
function LayoutThumbnail({ id }: { readonly id: string }) {
  const brand = () => [
    <i class="t-title" />,
    <i class="t-link" />,
    <i class="t-link" />,
    <i class="t-link" />,
  ];
  return (
    <div class="layout-thumb" data-layout={id}>
      {THUMBNAIL_PARTS.flatMap((part) => {
        if (part === "tile") {
          return Array.from({ length: THUMBNAIL_TILES }, () => <span class="t-tile" />);
        }
        const inside = part === "bar" || part === "rail" ? brand() : null;
        return [<span class={`t-${part}`}>{inside}</span>];
      })}
    </div>
  );
}

/**
 * The variations gallery: every value of the four axes on a tile, drawn from the registries of
 * `@identgineer/variations`, each tile a link that applies it. The page reads as links without a
 * script. With one, a tile applies its value in place, as the appearance panel does, and the
 * current value of each axis is marked.
 */
@Component({ tag: "site-variations" })
export class SiteVariations {
  /** The labels the CMS gives the navigation's pages, as JSON, from the prerenderer. */
  @Prop() readonly navigation: string = "";

  @Element() private readonly host!: HTMLElement;

  @State() private state: VariationState = getVariations();

  @State() private announcement = "";

  private stopListening?: () => void;

  connectedCallback(): void {
    this.state = getVariations();
    if (!Build.isBrowser) return;
    // The page's root is the truth: a choice made anywhere (the panel, a link, a script) is shown.
    this.stopListening = onVariationsChange(({ state }) => {
      this.state = state;
    });
  }

  /**
   * Says which tile is current to assistive technology, once the app has read the page's root. The
   * page is drawn without the claim: it is written with the defaults, and a visitor's choice may
   * have been put on the root since, so before this runs the word "Current", which the root's own
   * attributes show and hide, is the only mark, and it is always right.
   */
  componentDidRender(): void {
    if (!Build.isBrowser) return;
    Array.from(this.host.querySelectorAll("a.tile-link")).forEach((link) => {
      const tile = link.closest("li.gallery-tile");
      const axis = tile?.getAttribute("data-axis") as VariationAxis | undefined;
      const current = axis !== undefined && this.state[axis] === tile?.getAttribute("data-value");
      if (current) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  disconnectedCallback(): void {
    this.stopListening?.();
    this.stopListening = undefined;
  }

  /** A plain click applies the choice here; a click that asks for another tab or window does not. */
  private readonly choose =
    (choice: Partial<VariationState>, message: string) =>
    (event: MouseEvent): void => {
      const own =
        event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      if (event.defaultPrevented || !own) return;
      event.preventDefault();
      applyVariations(choice, { persist: true });
      this.announcement = message;
    };

  private readonly shuffle = (): void => {
    const next = shuffleVariations();
    const { state } = applyVariations(
      { theme: next.theme, design: next.design, layout: next.layout, ux: next.ux },
      { persist: true },
    );
    this.announcement = describeLook(state);
  };

  /**
   * What a preview is scoped by: its own value. A theme's preview also takes the page's other
   * choices and its scheme, because the design's and the mode's tokens are worked out where they are
   * set, and would otherwise be worked out with the page's theme.
   */
  private scopeOf(section: GallerySection, tile: GalleryTile): Record<string, string> {
    if (section.axis !== "theme") return { [section.attribute]: tile.id };
    const { design, layout, ux, scheme } = this.state;
    return {
      "data-theme": tile.id,
      "data-design": design,
      "data-layout": layout,
      "data-ux": ux,
      ...(scheme === "system" ? {} : { "data-scheme": scheme }),
    };
  }

  private renderPreview(section: GallerySection, tile: GalleryTile) {
    const sample = {
      theme: <ThemeSample theme={tile.id} label={tile.label} />,
      design: <Sample />,
      layout: <LayoutThumbnail id={tile.id} />,
      ux: <UxSample />,
    }[section.axis];
    return (
      <div
        class={`tile-preview tile-preview-${section.axis}`}
        aria-hidden="true"
        inert
        {...this.scopeOf(section, tile)}
      >
        {sample}
      </div>
    );
  }

  private renderTile(section: GallerySection, tile: GalleryTile) {
    const describedBy = `${section.axis}-${tile.id}-description`;
    return (
      <li class="gallery-tile" data-axis={section.axis} data-value={tile.id}>
        <div class="tile-card">
          {this.renderPreview(section, tile)}
          <div class="tile-text">
            <h3 class="tile-name">
              <a
                class="tile-link"
                href={tile.href}
                aria-describedby={describedBy}
                onClick={this.choose(
                  { [section.axis]: tile.id },
                  describeChoice(section.axis, tile.id),
                )}
              >
                {tile.label}
              </a>
              <span class="tile-current">Current</span>
            </h3>
            <p class="tile-description" id={describedBy}>
              {tile.description}
            </p>
          </div>
        </div>
      </li>
    );
  }

  private renderSection(section: GallerySection) {
    return (
      <section class="prose-section" aria-labelledby={section.id}>
        <h2 id={section.id}>{section.title}</h2>
        <p class="section-says">{SECTION_SAYS[section.axis]}</p>
        <div class="gallery-room">
          <ul class="gallery-tiles" data-count={String(section.tiles.length)}>
            {section.tiles.map((tile) => this.renderTile(section, tile))}
          </ul>
        </div>
      </section>
    );
  }

  private renderCombine() {
    return (
      <section class="prose-section" aria-labelledby={COMBINE_ID}>
        <h2 id={COMBINE_ID}>Combine</h2>
        <p class="section-says">
          Four values make a look. These go well together, and each link applies all four.
        </p>
        <div class="gallery-room">
          <ul class="gallery-tiles combos" data-count={String(combinationRecords().length)}>
            {combinationRecords().map((combination) => (
              <li class="combo">
                <div
                  class="combo-preview"
                  aria-hidden="true"
                  inert
                  data-theme={combination.state.theme}
                  data-design={combination.state.design}
                  data-ux={combination.state.ux}
                >
                  <LayoutThumbnail id={combination.state.layout} />
                </div>
                <h3 class="combo-name">
                  <a
                    class="combo-link"
                    href={combination.href}
                    onClick={this.choose(
                      { ...combination.state },
                      `Now showing ${combination.label}.`,
                    )}
                  >
                    {combination.label}
                  </a>
                </h3>
                <p>{combination.description}</p>
                <p class="combo-values">
                  {AXES.map((axis) => labelOf(axis, combination.state[axis])).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div class="combine-actions">
          <idg-button class="needs-script" variant="secondary" onClick={this.shuffle}>
            <idg-icon slot="start" name="sparkles" />
            Surprise me
          </idg-button>
        </div>
      </section>
    );
  }

  render() {
    const sections = galleryRecords();
    const entries = [
      ...sections.map(({ id, title }) => ({ id, text: title, children: [] })),
      { id: COMBINE_ID, text: "Combine", children: [] },
    ];
    return (
      <SiteShell current="/variations/" navigation={this.navigation}>
        <style>
          {currentMarkerCss(sections)}
          {gridCss(Math.max(GRID_COUNTS, ...sections.map((section) => section.tiles.length)))}
        </style>
        <div slot="hero" class="page-hero">
          <p class="eyebrow">Variations</p>
          <h1 id="page-title">Variations gallery</h1>
          <p class="lede">
            {countsLine()}: every value on a tile, ready to apply to this page and to mix.
          </p>
        </div>
        <div class="reading">
          <div class="reading-body">
            <div class="reading-guide">
              <ContentsNav entries={entries} inline />
            </div>
            <article class="prose gallery" aria-labelledby="page-title">
              <div class="prose-intro">
                <p>
                  Choose a tile to see this page in that value. The choice is kept for your next
                  visit, and the same choice can be written into an address:{" "}
                  <code class="name">?idg-theme=ember</code> is the Ember theme.
                </p>
                <p class="script-note">
                  Choosing a look needs JavaScript. Without it, each tile is still a link whose
                  address names its value, for a page that does run the script.
                </p>
                <p class="visually-hidden" role="status">
                  {this.announcement}
                </p>
              </div>
              {sections.map((section) => this.renderSection(section))}
              {this.renderCombine()}
            </article>
          </div>
        </div>
        <ContentsNav entries={entries} inline={false} />
      </SiteShell>
    );
  }
}
