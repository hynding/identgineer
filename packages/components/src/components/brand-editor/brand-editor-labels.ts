import type {
  BrandKitErrorCode,
  BrandKitStoreErrorCode,
  SvgLogoErrorCode,
  SvgLogoRemovalReason,
} from "@identgineer/brand";

type Messages<Code extends string, Prefix extends string> = {
  readonly [Key in Code as `${Prefix}${Capitalize<CamelCase<Key>>}`]: string;
};
type CamelCase<Text extends string> = Text extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : Text;

/** One fixed message for each code `parseBrandKit` gives, shown on the field it names. */
export type BrandEditorFieldMessages = Messages<BrandKitErrorCode, "field">;
/** One fixed message for each reason an upload is refused: the sanitiser's codes, and an unreadable file. */
export type BrandEditorUploadMessages = Messages<SvgLogoErrorCode | "unreadable", "upload">;
/** One sentence for each reason the sanitiser removes a part of an upload. */
export type BrandEditorRemovalMessages = Messages<SvgLogoRemovalReason, "removed">;
/** One fixed message for each `BrandKitStoreError` code, and for a store that failed otherwise. */
export type BrandEditorStoreMessages = Messages<
  BrandKitStoreErrorCode | "unknown" | "no-store" | "unreadable-answer",
  "save"
>;

/**
 * Every word of idg-brand-editor. Override any of them through `labels`; placeholders in braces
 * are filled in where a default has them. No message ever holds what a server, a file or a kit
 * said: each is fixed per code.
 */
export interface BrandEditorLabels
  extends
    BrandEditorFieldMessages,
    BrandEditorUploadMessages,
    BrandEditorRemovalMessages,
    BrandEditorStoreMessages {
  /** The accessible name of the form, when `label` is not set. */
  readonly name: string;
  readonly id: string;
  readonly idHint: string;
  readonly brandName: string;
  readonly tagline: string;
  readonly optional: string;
  readonly coloursLegend: string;
  readonly primary: string;
  readonly secondary: string;
  readonly neutralTint: string;
  readonly colourHint: string;
  readonly optionalColourHint: string;
  /** The name of the native colour picker beside a hex field: the field's `{colour}`. */
  readonly colourPicker: string;
  readonly styleLegend: string;
  readonly typography: string;
  readonly corners: string;
  readonly cornersSharp: string;
  readonly cornersSoft: string;
  readonly cornersRound: string;
  readonly tone: string;
  readonly toneCalm: string;
  readonly toneBalanced: string;
  readonly toneVivid: string;
  readonly imagesLegend: string;
  readonly logo: string;
  readonly mark: string;
  /** Under each upload: the sanitiser's limit as `{size}`. */
  readonly imageHint: string;
  readonly noLogo: string;
  readonly noMark: string;
  readonly reading: string;
  /** The remove button of an upload: the upload's `{image}` (`logo` or `mark`). */
  readonly removeImage: string;
  /** Announced when an upload is removed. */
  readonly imageRemoved: string;
  /** Said of a logo or mark the kit held that is not the sanitiser's output. */
  readonly kitImageRefused: string;
  /** Above the list of what the sanitiser removed: the upload's `{image}` and the `{count}`. */
  readonly removalsHeading: string;
  readonly removalsAdvice: string;
  /** One removal: its `{reason}` sentence, the `{element}` and the `{line}` it was on. */
  readonly removal: string;
  /** One removal of an attribute: also its `{attribute}`. */
  readonly removalAttribute: string;
  /** After the listed removals, when the sanitiser reported only the first: the `{count}` left. */
  readonly moreRemovals: string;
  /** Announced when an upload is accepted as it was. */
  readonly imageAccepted: string;
  readonly save: string;
  readonly saved: string;
  /** After a save, when the form was changed while the store answered. */
  readonly savedBefore: string;
  /** The summary of a form with fields to correct. */
  readonly errorFields: string;
  /** On a field the server refused (`validation`). */
  readonly fieldRefused: string;
  /** On a field the server did not store as sent (`not-applied`). */
  readonly fieldNotSaved: string;
  readonly previewHeading: string;
  readonly previewEmpty: string;
  readonly previewStale: string;
}

export const BRAND_EDITOR_LABELS: BrandEditorLabels = {
  name: "Brand kit",
  id: "Theme id",
  idHint:
    "2 to 32 lower-case letters and digits, in words joined by single hyphens, starting with a letter. Pages set it as data-theme.",
  brandName: "Name",
  tagline: "Tagline",
  optional: "optional",
  coloursLegend: "Colours",
  primary: "Primary colour",
  secondary: "Secondary colour",
  neutralTint: "Neutral tint",
  colourHint: "A hex colour such as #4f46e5.",
  optionalColourHint: "A hex colour such as #0f766e. Leave it empty for none.",
  colourPicker: "Pick the {colour}",
  styleLegend: "Type, corners and tone",
  typography: "Font pairing",
  corners: "Corners",
  cornersSharp: "Sharp",
  cornersSoft: "Soft",
  cornersRound: "Round",
  tone: "Tone",
  toneCalm: "Calm",
  toneBalanced: "Balanced",
  toneVivid: "Vivid",
  imagesLegend: "Logo and mark",
  logo: "Logo",
  mark: "Mark",
  imageHint:
    "An SVG file of at most {size}. It is cleaned before it is used: anything that could run, load or track is removed.",
  noLogo: "No logo yet.",
  noMark: "No mark yet.",
  reading: "Reading the file…",
  removeImage: "Remove the {image}",
  imageRemoved: "Removed.",
  kitImageRefused: "The kit's own file could not be used and was left out.",
  removalsHeading: "The {image} was cleaned: {count} parts were removed.",
  removalsAdvice: "Check the preview. Save to keep it as it is now, or remove it.",
  removal: "{reason} ({element}, line {line})",
  removalAttribute: "{reason} ({element} {attribute}, line {line})",
  moreRemovals: "And {count} more.",
  imageAccepted: "The file was accepted as it is.",
  save: "Save brand kit",
  saved: "Brand kit saved.",
  savedBefore: "Brand kit saved as it was when you saved it. Your later changes are not saved yet.",
  errorFields: "Some fields need a change. Each says what is wrong.",
  fieldRefused: "The server refused this value.",
  fieldNotSaved: "The server did not save this value as it was sent.",
  previewHeading: "Preview",
  previewEmpty: "The preview appears once the kit has a valid theme id, name and primary colour.",
  previewStale: "The preview shows the last valid version of the kit.",

  fieldNotAnObject: "This is not a brand kit.",
  fieldUnreadable: "This could not be read.",
  fieldUnknownKey: "This is not a field of a brand kit.",
  fieldMissing: "Fill this in.",
  fieldWrongType: "This has the wrong kind of value.",
  fieldTooShort: "Fill this in.",
  fieldTooLong: "This is too long: the name takes up to 60 characters and the tagline 120.",
  fieldInvalidId:
    "Use 2 to 32 lower-case letters and digits, in words joined by single hyphens, starting with a letter.",
  fieldReservedId: "This id is taken by the design system. Choose another.",
  fieldInvalidText:
    "Use letters, digits, single spaces and . , ' ’ & ! ? - only, with no space at either end.",
  fieldInvalidColor: "Enter a hex colour: # and 3 or 6 digits from 0 to 9 and a to f.",
  fieldNotAllowed: "Choose one of the options.",
  fieldInvalidLogo: "This file is not an SVG the sanitiser accepts. Upload it again.",
  fieldUnsanitisedLogo: "This file must be uploaded again, so it can be cleaned.",
  fieldTooManyErrors: "There are more problems than can be listed.",

  uploadWrongType: "This file could not be read as an SVG.",
  uploadInvalidOption: "This file could not be read as an SVG.",
  uploadTooLarge: "The file is too large. A logo may be at most 512 KB.",
  uploadInvalidEncoding: "The file is not UTF-8 text. Save it as UTF-8 and try again.",
  uploadInvalidCharacter: "The file holds a character an SVG may not.",
  uploadMalformed: "The file is not a well-formed SVG.",
  uploadDoctype:
    "The file declares a document type with its own definitions, which is not allowed.",
  uploadProcessingInstruction: "The file holds a processing instruction, which is not allowed.",
  uploadInvalidDeclaration: "The file's XML declaration is not version 1.0 in UTF-8.",
  uploadInvalidName: "The file holds an element or attribute name that is not allowed.",
  uploadDuplicateAttribute: "An element in the file has the same attribute twice.",
  uploadInvalidEntity: "The file uses an entity or character reference that is not allowed.",
  uploadMismatchedTag: "An element in the file is not closed where it should be.",
  uploadInvalidComment: "The file holds a comment written in a way that is not allowed.",
  uploadInvalidNamespace: "The file uses a namespace in a way that is not allowed.",
  uploadNotSvg: "The file is not an SVG image.",
  uploadTooManyElements: "The file has too many elements for a logo.",
  uploadTooDeep: "The file's elements are nested too deeply.",
  uploadTooManyAttributes: "An element in the file has too many attributes.",
  uploadTooLong: "A value or text in the file is too long.",
  uploadNumberOutOfRange: "A number in the file is too large.",
  uploadTooManyStops: "A gradient in the file has too many stops.",
  uploadTooManyIds: "The file has too many ids.",
  uploadDuplicateId: "Two elements in the file have the same id.",
  uploadReferenceCycle: "The file has a reference that leads back to itself.",
  uploadReferenceTooDeep: "The file has references nested too deeply.",
  uploadExpansionTooLarge: "The file reuses its shapes too many times.",
  uploadDrawingTooCostly: "The file would take too long to draw.",
  uploadOverdrawTooLarge: "The file paints over itself too many times.",
  uploadTooManyMasks: "The file applies too many masks or clip paths.",
  uploadMasksTooDeep: "The file nests masks or clip paths too deeply.",
  uploadMissingSize: "The file has no size: give its root a view box, or a width and height.",
  uploadUnsupportedFeature:
    "The file uses a form of clipping, masking or sizing that is not supported. Export it again more simply.",
  uploadInternalError: "The file could not be cleaned. Export it again more simply.",
  uploadUnreadable: "The file could not be read. Choose it again.",

  removedActiveContent: "Script or other active content was removed",
  removedEventHandler: "An event handler was removed",
  removedExternalReference: "A link or reference to another file was removed",
  removedStyling: "Styling that is not supported was removed",
  removedEditorMetadata: "Editor data was removed",
  removedText: "Text was removed",
  removedFilter: "A filter was removed",
  removedForeignNamespace: "Content from another format was removed",
  removedUnsupportedElement: "An element that is not supported was removed",
  removedUnsupportedAttribute: "An attribute that is not supported was removed",
  removedInvalidValue: "A value that is not valid was removed",
  removedMisplaced: "Something in the wrong place was removed",
  removedDanglingReference: "A reference to nothing was removed",
  removedCharacterData: "Loose text was removed",
  removedDocumentType: "A document type declaration was removed",
  removedRenderCost: "A part too costly to draw was removed",
  removedRewritten: "A clip path was rewritten as a mask",

  saveUnauthorized: "You are signed out. Sign in again, then save.",
  saveForbidden: "You may not change this brand kit.",
  saveNotFound: "This brand kit was not found. It may have been deleted.",
  saveValidation: "The kit was not saved: the fields marked below were refused.",
  saveNotApplied:
    "The kit was saved, but not every change was applied. Check the fields marked below and save again.",
  saveRateLimited: "Too many saves in a short time. Wait a minute, then save again.",
  saveNetwork: "The kit could not be saved: the server could not be reached. Save again.",
  saveRequestRefused: "The kit could not be saved: the request was refused before it was sent.",
  saveMalformedResponse:
    "The server's answer could not be read. Check the kit before saving again.",
  saveUnexpectedStatus: "The kit could not be saved. Try again later.",
  saveUnknown: "The kit could not be saved. Try again later.",
  saveNoStore: "The kit cannot be saved here: no store is connected.",
  saveUnreadableAnswer:
    "The kit was sent, but the answer could not be read. Check it before saving again.",
};
