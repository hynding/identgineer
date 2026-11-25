import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { copyText } from "../../utils/copy-text";
import { downloadText } from "../../utils/download-text";
import { headingLevel } from "../../utils/heading-level";
import { ownValue } from "../../utils/own-value";
import { emitFailure, emitTheme, type EmittedTheme } from "./brand-export-emit";
import {
  artefactFile,
  fileSlug,
  themeIdOf,
  usageSnippet,
  type Artefact,
} from "./brand-export-files";
import { BRAND_EXPORT_LABELS, type BrandExportLabels } from "./brand-export-labels";
import type { BrandExportDetail, BrandExportTheme } from "./brand-export-types";

/**
 * An artefact longer than this is not shown. A theme emits a few kilobytes; a megabyte of text in a
 * `<pre>` takes the page over a second to lay out.
 */
const MAX_ARTEFACT_LENGTH = 262_144;
const DEFAULT_LEVEL = 2;

interface ArtefactView {
  readonly artefact: Artefact;
  readonly text: string;
  readonly heading: string;
  readonly name: string;
  readonly hint: string;
  readonly file?: { readonly name: string; readonly type: string };
}

function artefactText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value.length <= MAX_ARTEFACT_LENGTH
    ? value
    : undefined;
}

/**
 * Lets a person take a brand theme away: the stylesheet and the token source `@identgineer/brand`
 * emits, and the lines that put the theme on a page. Each is shown in full as text in a focusable,
 * scrollable region, and can be copied to the clipboard or downloaded as a file.
 *
 * Copying uses the asynchronous clipboard API inside the click that asked for it; where the page
 * may not use it, or the browser refuses, the text is selected instead and the message says so.
 * Downloading hands the browser a blob with an explicit type and a file name made of lower case
 * letters, digits and hyphens from the brand's name, and revokes the object url afterwards. Neither
 * needs more of a Content-Security-Policy than a page with none of this already has. Whatever the
 * texts hold is drawn as text, never as markup.
 *
 * @part export - The group around everything.
 * @part artefact - One artefact: its heading, hint, code and buttons.
 * @part title - An artefact's heading.
 * @part hint - What the artefact is for.
 * @part code - The scrollable region that holds the text.
 * @part actions - The row of buttons.
 * @part status - The message that follows an action.
 * @part problem - The message shown when the theme could not be emitted.
 * @part empty - The message shown when there is nothing to export.
 */
@Component({
  tag: "idg-brand-export",
  styleUrls: ["../../styles/visually-hidden.css", "brand-export.css"],
  shadow: true,
})
export class IdgBrandExport {
  @Element() host!: HTMLElement;

  /** The text `emitBrandThemeCss` produced. */
  @Prop() css?: string;

  /** The text `emitBrandThemeTokens` produced. */
  @Prop() tokens?: string;

  /**
   * A theme from `generateBrandTheme`. What `css` and `tokens` do not give is emitted from it here,
   * by the brand package's own emitters, and the id they scoped the stylesheet to is used for the
   * snippet, and its kit's name for the file names. Set it as a property.
   */
  @Prop() theme?: BrandExportTheme;

  /** The theme id for the usage snippet when the stylesheet is given as `css`; an emitted one names its own. */
  @Prop({ attribute: "theme-id" }) themeId?: string;

  /** The brand's name, which the file names are made from. */
  @Prop() name?: string;

  /** The accessible name of the whole. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. */
  @Prop() labels?: Partial<BrandExportLabels>;

  /** The level of the artefacts' headings, 1 to 6. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_LEVEL;

  /** Fires after an artefact was put on the clipboard. Not fired when it was only selected. */
  @Event() idgCopy!: EventEmitter<BrandExportDetail>;

  /** Fires after the browser was handed an artefact to download. */
  @Event() idgDownload!: EventEmitter<BrandExportDetail>;

  @State() private emitted?: EmittedTheme;
  @State() private message = "";
  // The message is written into one of two nodes, alternately: a live region announces what is
  // added, so the same words said twice would be silent the second time if they stayed in one node.
  @State() private slot: 0 | 1 = 0;
  @State() private messageShown = false;

  private readonly codes = new Map<Artefact, HTMLElement>();

  // Emitting reads the whole theme again, so it runs when the theme changes and not on every render.
  @Watch("theme")
  protected themeChanged(): void {
    this.emitted = this.theme === undefined ? undefined : emitTheme(this.theme);
  }

  componentWillLoad(): void {
    this.themeChanged();
  }

  private say(message: string): void {
    this.message = message;
    this.messageShown = true;
    this.slot = this.slot === 0 ? 1 : 0;
  }

  private select(artefact: Artefact): void {
    const code = this.codes.get(artefact);
    const region = code?.closest<HTMLElement>('[role="region"]');
    if (code === undefined || typeof window.getSelection !== "function") return;
    // Focus first, so the keys that copy a selection act on it.
    region?.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.selectAllChildren(code);
  }

  private async copy(view: ArtefactView, labels: BrandExportLabels): Promise<void> {
    const values = { artefact: view.name };
    // Called before anything is awaited, so it is still inside the click's user gesture.
    if (await copyText(view.text)) {
      this.say(fillTemplate(labels.copied, values));
      this.idgCopy.emit({ artefact: view.artefact });
      return;
    }
    this.say(fillTemplate(labels.copyFailed, values));
    this.select(view.artefact);
  }

  private download(view: ArtefactView, labels: BrandExportLabels): void {
    const file = view.file;
    const root = this.host.shadowRoot;
    if (file === undefined || root === null) return;
    const anchor = document.createElement("a");
    anchor.hidden = true;
    root.appendChild(anchor);
    const done = downloadText(anchor, view.text, file.name, file.type);
    anchor.remove();
    if (!done) {
      this.say(fillTemplate(labels.downloadFailed, { artefact: view.name }));
      return;
    }
    this.say(fillTemplate(labels.downloaded, { artefact: view.name, file: file.name }));
    this.idgDownload.emit({ artefact: view.artefact });
  }

  private views(labels: BrandExportLabels): ArtefactView[] {
    const kit = ownValue(this.theme, "kit");
    const name =
      typeof this.name === "string" && this.name.trim() !== "" ? this.name : ownValue(kit, "name");
    const slug = fileSlug(name);
    const given = artefactText(this.css);
    const css = given ?? artefactText(this.emitted?.css);
    // The snippet names the theme the stylesheet shown defines: the emitted one's id for an emitted
    // stylesheet, and `themeId` only for one that was handed over as text.
    const id = themeIdOf(given === undefined ? this.emitted?.id : this.themeId);
    const tokens = artefactText(this.tokens) ?? artefactText(this.emitted?.tokens);
    const cssFile = artefactFile("css", slug);
    const tokensFile = artefactFile("tokens", slug);
    const views: (ArtefactView | undefined)[] = [
      css === undefined
        ? undefined
        : {
            artefact: "css",
            text: css,
            heading: labels.cssHeading,
            name: labels.cssName,
            hint: fillTemplate(labels.cssHint, { file: cssFile.name }),
            file: cssFile,
          },
      tokens === undefined
        ? undefined
        : {
            artefact: "tokens",
            text: tokens,
            heading: labels.tokensHeading,
            name: labels.tokensName,
            hint: fillTemplate(labels.tokensHint, { file: tokensFile.name }),
            file: tokensFile,
          },
      id === undefined
        ? undefined
        : {
            artefact: "snippet",
            text: usageSnippet(id, slug),
            heading: labels.snippetHeading,
            name: labels.snippetName,
            hint: labels.snippetHint,
          },
    ];
    // The snippet names the files, so it is shown only where there is a file to name.
    const present = views.filter((view) => view !== undefined);
    return present.some((view) => view.artefact !== "snippet") ? present : [];
  }

  render() {
    const labels = mergeLabels(BRAND_EXPORT_LABELS, this.labels);
    const Heading = `h${String(headingLevel(this.headingLevel, DEFAULT_LEVEL))}`;
    const views = this.views(labels);
    const exportable = views.filter((view) => view.artefact !== "snippet");
    const failed =
      this.theme !== undefined &&
      this.emitted === undefined &&
      (artefactText(this.css) === undefined || artefactText(this.tokens) === undefined);
    return (
      <div
        class="export"
        part="export"
        role="group"
        aria-label={typeof this.label === "string" && this.label !== "" ? this.label : labels.name}
      >
        {failed ? (
          <p class="problem" part="problem">
            {emitFailure(this.theme) === "no-kit" ? labels.emitNoKit : labels.emitFailed}
          </p>
        ) : null}
        {exportable.length === 0 && !failed ? (
          <p class="empty" part="empty">
            {labels.empty}
          </p>
        ) : null}
        {views.map((view) => (
          <section
            class="artefact"
            part="artefact"
            data-artefact={view.artefact}
            aria-labelledby={`title-${view.artefact}`}
          >
            <Heading class="title" part="title" id={`title-${view.artefact}`}>
              {view.heading}
            </Heading>
            <p class="hint" part="hint">
              {view.hint}
            </p>
            <div
              class="code"
              part="code"
              role="region"
              tabindex="0"
              aria-labelledby={`title-${view.artefact}`}
            >
              <pre>
                <code
                  ref={(element) => {
                    this.keep(view.artefact, element);
                  }}
                >
                  {view.text}
                </code>
              </pre>
            </div>
            <div class="actions" part="actions">
              <idg-button
                variant="secondary"
                size="sm"
                data-action={`copy-${view.artefact}`}
                onClick={() => {
                  void this.copy(view, labels);
                }}
              >
                {fillTemplate(labels.copy, { artefact: view.name })}
              </idg-button>
              {view.file === undefined ? null : (
                <idg-button
                  variant="secondary"
                  size="sm"
                  data-action={`download-${view.artefact}`}
                  onClick={() => {
                    this.download(view, labels);
                  }}
                >
                  {fillTemplate(labels.download, { artefact: view.name })}
                </idg-button>
              )}
            </div>
          </section>
        ))}
        <p
          class={{ status: true, "visually-hidden": !this.messageShown }}
          part="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span data-slot="0">{this.slot === 0 ? this.message : ""}</span>
          <span data-slot="1">{this.slot === 1 ? this.message : ""}</span>
        </p>
      </div>
    );
  }

  private keep(artefact: Artefact, element: HTMLElement | undefined): void {
    if (element === undefined) this.codes.delete(artefact);
    else this.codes.set(artefact, element);
  }
}
