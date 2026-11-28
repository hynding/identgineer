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

const AXES: readonly VariationAxis[] = ["theme", "design", "layout", "ux"];

/** What each axis changes, in a line under its heading. */
const SECTION_SAYS: Readonly<Record<VariationAxis, string>> = {
  theme: "Colour, type and a light and a dark scheme. Each tile is drawn in its own theme.",
  design: "Surfaces, borders, corners and depth. Each tile is drawn in its own design.",
  layout:
    "Where the page's regions go. Each tile is a sketch of its layout, not the layout itself.",
  ux: "Density, type scale, motion and hints. Each tile is drawn in its own mode.",
};

/**
 * The components a theme, a design or a UX mode is drawn on: a small card with a button, a badge
 * and a progress bar, the same in every tile, so what differs between tiles is the value alone.
 */
function Sample() {
  return (
    <idg-card variant="raised" padding="sm">
      <div class="sample">
        <span class="sample-title">Sample</span>
        <idg-badge variant="accent" size="sm">
          Badge
        </idg-badge>
        <idg-button size="sm">Button</idg-button>
        <idg-progress value={64} />
      </div>
    </idg-card>
  );
}

/**
 * A sketch of a layout in CSS: its regions as boxes. A layout cannot be scoped to a container, as
 * a theme, a design or a UX mode can, because it is the arrangement of the page's own landmarks,
 * which idg-layout draws once, so the thumbnail is a drawing of it and says so.
 */
function LayoutThumbnail({ id }: { readonly id: string }) {
  return (
    <div class="layout-thumb" data-layout={id}>
      {THUMBNAIL_PARTS.flatMap((part) =>
        part === "tile"
          ? Array.from({ length: THUMBNAIL_TILES }, () => <span class="t-tile" />)
          : [<span class={`t-${part}`} />],
      )}
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
    return (
      <div class="tile-preview" aria-hidden="true" inert {...this.scopeOf(section, tile)}>
        {section.axis === "layout" ? <LayoutThumbnail id={tile.id} /> : <Sample />}
      </div>
    );
  }

  private renderTile(section: GallerySection, tile: GalleryTile) {
    const describedBy = `${section.axis}-${tile.id}-description`;
    return (
      <li class="gallery-tile" data-axis={section.axis} data-value={tile.id}>
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
      </li>
    );
  }

  private renderSection(section: GallerySection) {
    return (
      <section class="prose-section" aria-labelledby={section.id}>
        <h2 id={section.id}>{section.title}</h2>
        <p class="section-says">{SECTION_SAYS[section.axis]}</p>
        <div class="gallery-room">
          <ul class="gallery-tiles">
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
          <ul class="combos">
            {combinationRecords().map((combination) => (
              <li class="combo">
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
        <style>{currentMarkerCss(sections)}</style>
        <div slot="hero" class="page-hero">
          <p class="eyebrow">Variations</p>
          <h1 id="page-title">Variations gallery</h1>
          <p class="lede">
            Eight themes, eight designs, eight layouts and eight UX modes: every value on a tile,
            ready to apply to this page and to mix.
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
