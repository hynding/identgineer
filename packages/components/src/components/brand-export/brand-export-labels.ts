/**
 * The words of idg-brand-export. Override any of them through `labels`; the placeholders in braces
 * are filled in where a default has them.
 */
export interface BrandExportLabels {
  /** The accessible name of the whole, when `label` is not set. */
  readonly name: string;
  /** What each artefact is called inside a sentence or a button: lower case in English. */
  readonly cssName: string;
  readonly tokensName: string;
  readonly snippetName: string;
  readonly cssHeading: string;
  readonly tokensHeading: string;
  readonly snippetHeading: string;
  /** What the stylesheet is for, with the `{file}` it downloads as. */
  readonly cssHint: string;
  readonly tokensHint: string;
  readonly snippetHint: string;
  /** The buttons, with the artefact's `{artefact}` name. */
  readonly copy: string;
  readonly download: string;
  /** The messages that follow an action, with the `{artefact}` and for a download its `{file}`. */
  readonly copied: string;
  readonly copyFailed: string;
  readonly downloaded: string;
  readonly downloadFailed: string;
  readonly emitFailed: string;
  readonly empty: string;
}

export const BRAND_EXPORT_LABELS: BrandExportLabels = {
  name: "Brand theme files",
  cssName: "stylesheet",
  tokensName: "design tokens",
  snippetName: "snippet",
  cssHeading: "Stylesheet",
  tokensHeading: "Design tokens",
  snippetHeading: "Use it",
  cssHint: "The theme as CSS. Save it as {file} and load it after the tokens stylesheet.",
  tokensHint: "The theme as a design token source. Save it as {file}.",
  snippetHint: "Add these lines to your page, with the paths changed to where you put the files.",
  copy: "Copy {artefact}",
  download: "Download {artefact}",
  copied: "The {artefact} was copied.",
  copyFailed: "The {artefact} could not be copied, so it is selected: copy it yourself.",
  downloaded: "The {artefact} was downloaded as {file}.",
  downloadFailed: "The {artefact} could not be downloaded.",
  emitFailed: "The theme could not be turned into files: it no longer matches its brand kit.",
  empty: "There is nothing to export yet.",
};
