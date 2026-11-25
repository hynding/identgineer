import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import type { SvgLogoRemoval } from "@identgineer/brand";
import { NAME_MAX_LENGTH, SVG_LOGO_LIMITS, TAGLINE_MAX_LENGTH } from "@identgineer/brand/edit";
import { CORNERS, FONT_PAIRINGS, TONES } from "@identgineer/brand/presets";
import { Attempts } from "../../identity/attempts";
import { containInnerEvents } from "../../identity/form-controls";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { systemTimers, type CountdownClock } from "../../identity/throttle-countdown";
import { Debounce } from "../../utils/debounce";
import { numberFormatter } from "../../utils/format-number";
import { headingLevel } from "../../utils/heading-level";
import { languageOf } from "../../utils/language";
import {
  colourPickerValue,
  COLOUR_FIELDS,
  DRAFT_FIELDS,
  draftFromKit,
  EMPTY_DRAFT,
  previewOf,
  PREVIEW_DELAY_MS,
  validateDraft,
  type BrandDraft,
  type ColourField,
  type DraftField,
  type DraftPreview,
  type ImageField,
} from "./brand-editor-draft";
import { BRAND_EDITOR_LABELS, type BrandEditorLabels } from "./brand-editor-labels";
import {
  isBrandEditorStore,
  readSaved,
  readUnreadDocumentId,
  readStoreFailure,
  type BrandEditorStore,
  type StoreFailure,
} from "./brand-editor-store";
import type { BrandEditorKit, BrandEditorSaveDetail } from "./brand-editor-types";
import { LogoUploads, type UploadFile, type UploadRefusalCode } from "./brand-editor-upload";

const DEFAULT_LEVEL = 2;
const IMAGE_FIELDS: readonly ImageField[] = ["logo", "mark"];

/**
 * The name each control carries. A named control of a form is also a property of the form, so a
 * control named `id` or `name` would shadow the form's own: every name is prefixed.
 */
const controlName = (field: DraftField): string => `brand-${field}`;

type Messages = Partial<Record<DraftField, string>>;

interface Summary {
  readonly text: string;
  /** New for every summary, so the alert is drawn afresh and announced again. */
  readonly key: number;
}

interface Removals {
  readonly removed: readonly SvgLogoRemoval[];
  readonly count: number;
  readonly key: number;
}

/** What the preview shows: the kit with the draft's logo and mark, and its theme. */
interface Shown {
  /** The kit as validated, without the logo and mark. */
  readonly base: DraftPreview["kit"];
  readonly kit: Omit<DraftPreview["kit"], "logo" | "mark"> & {
    readonly logo?: string;
    readonly mark?: string;
  };
  readonly theme: DraftPreview["theme"];
  /** Whether it is the draft as it stands, or the last valid version of it. */
  readonly current: boolean;
}

interface Focusable {
  setFocus?: () => Promise<void>;
  focus?: () => void;
}

/** A copy of the record without one key. */
function without<Key extends string, Value>(
  record: Partial<Record<Key, Value>>,
  key: Key,
): Partial<Record<Key, Value>> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key)) as Partial<
    Record<Key, Value>
  >;
}

const camel = (code: string): string =>
  code.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const capitalised = (code: string): string => {
  const name = camel(code);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The fixed message `labels` has for a code, by the code's name: `fieldInvalidColor`. */
function message(labels: BrandEditorLabels, prefix: string, code: string): string {
  const key = `${prefix}${capitalised(code)}`;
  const text = Object.hasOwn(labels, key)
    ? (labels as unknown as Record<string, unknown>)[key]
    : "";
  return typeof text === "string" ? text : "";
}

/**
 * A form for one brand kit, with a live preview: the name, tagline and theme id, the colours (a
 * hex field with a native colour picker in it, kept in step), the font pairing, corners and tone
 * from the brand package's presets, and the logo and mark as SVG uploads. It saves through the
 * `store` it is given (`create`, or `update` once there is a `documentId`) and keeps nothing in the
 * browser: the draft lives in the element and is gone with it.
 *
 * Everything is validated by `parseBrandKit`, and each of its error codes is one fixed message on
 * the field it names. An upload is refused by its size before it is read, read as bytes, and
 * passed through `sanitiseSvgLogo`; only the sanitiser's output is ever kept or drawn, and what it
 * removed is listed before the kit is saved. Nothing a file, a kit or the server said reaches the
 * page as markup, and no message repeats it.
 *
 * The preview is `idg-brand-guidelines` with the kit and the theme `generateBrandTheme` makes of
 * it, worked out once typing pauses, never on every keystroke. It is drawn in its own region and
 * styles nothing outside it.
 *
 * @part form - The form.
 * @part error - The summary of a failed save, or of the fields to change (`role="alert"`).
 * @part saved - The confirmation of a save (`role="status"`).
 * @part fieldset - A group of fields: the colours, the presets, the logo and mark.
 * @part image - The upload of the logo or the mark.
 * @part removals - What the sanitiser removed from an upload.
 * @part submit - The save button.
 * @part preview - The preview region.
 */
@Component({
  tag: "idg-brand-editor",
  styleUrls: [
    "../../styles/visually-hidden.css",
    "../../styles/focus-ring.css",
    "../../styles/identity-form.css",
    "brand-editor.css",
  ],
  shadow: true,
})
export class IdgBrandEditor {
  @Element() host!: HTMLElement;

  /**
   * The kit to start from, as `parseBrandKit` or the store's `get` returned it; none starts an
   * empty kit. Set it as a property: it is data, and untrusted. Setting it again starts over.
   */
  @Prop() kit?: BrandEditorKit;

  /**
   * Where the kit is saved: the object `createBrandKitStore` returns, or anything with its `create`
   * and `update`. Set it as a property. The element never creates one and never fetches.
   */
  @Prop() store?: BrandEditorStore;

  /**
   * The CMS's id of the kit being edited: saving updates it. Without one, the first save creates
   * a kit, and later saves update the kit it created. Set it with `kit`.
   */
  @Prop({ attribute: "document-id" }) documentId?: string;

  /** The accessible name of the form. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. Assign a new object to change them. */
  @Prop() labels?: Partial<BrandEditorLabels>;

  /** The level of the preview's heading, 1 to 6; the guide inside it starts one level deeper. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_LEVEL;

  /** Whether the live preview is shown. */
  @Prop() preview = true;

  /** Timers for the pause before the preview is worked out again; the browser's by default. For tests. */
  @Prop() clock?: CountdownClock;

  /** Fires after a save, with the stored kit's ids and nothing of its content. */
  @Event() idgSave!: EventEmitter<BrandEditorSaveDetail>;

  @State() private draft: BrandDraft = EMPTY_DRAFT;
  @State() private shown?: Shown;
  @State() private errors: Messages = {};
  @State() private summary?: Summary;
  @State() private savedKey = 0;
  @State() private pending = false;
  @State() private reading: Readonly<Record<ImageField, boolean>> = { logo: false, mark: false };
  @State() private removals: Partial<Record<ImageField, Removals>> = {};
  @State() private refusedFromKit: readonly ImageField[] = [];
  @State() private announcement: { readonly text: string; readonly slot: 0 | 1 } = {
    text: "",
    slot: 0,
  };

  private storedId?: string;
  /**
   * A kit this editor created that no `idgSave` has reported yet: a create that was not applied
   * whole, or not read back, stored it, and the first save that succeeds says it was created.
   */
  private createdUnreported?: string;
  private keys = 0;
  private focusInvalid = false;
  private readonly attempts = new Attempts();
  private readonly uploads = new LogoUploads();
  private readonly controls: Partial<Record<DraftField, Focusable>> = {};
  private readonly files: Partial<Record<ImageField, HTMLInputElement>> = {};
  /** The colour each picker last showed, which it keeps while its hex field holds no colour. */
  private picked: Partial<Record<ColourField, string>> = {};
  private readonly refresh = new Debounce(
    () => {
      this.showDraft();
    },
    PREVIEW_DELAY_MS,
    {
      setTimeout: (callback, delayMs) => this.timers().setTimeout(callback, delayMs),
      clearTimeout: (handle) => {
        this.timers().clearTimeout(handle);
      },
    },
  );

  @Watch("kit")
  protected kitChanged(): void {
    this.attempts.cancel();
    this.uploads.cancelAll();
    this.refresh.cancel();
    const { draft, refusedLogos } = draftFromKit(this.kit);
    this.draft = draft;
    this.picked = {};
    this.refusedFromKit = refusedLogos;
    this.storedId = this.validDocumentId();
    this.createdUnreported = undefined;
    this.errors = {};
    this.summary = undefined;
    this.savedKey = 0;
    this.pending = false;
    this.reading = { logo: false, mark: false };
    this.removals = {};
    this.shown = undefined;
    this.showDraft();
  }

  @Watch("documentId")
  protected documentIdChanged(): void {
    this.storedId = this.validDocumentId();
  }

  componentWillLoad(): void {
    this.kitChanged();
  }

  disconnectedCallback(): void {
    this.attempts.cancel();
    this.uploads.cancelAll();
    this.refresh.cancel();
    this.pending = false;
    this.reading = { logo: false, mark: false };
  }

  componentDidRender(): void {
    if (!this.focusInvalid) return;
    this.focusInvalid = false;
    const first = DRAFT_FIELDS.find((field) => this.errors[field] !== undefined);
    const control = first === undefined ? undefined : this.controls[first];
    if (control?.setFocus) void control.setFocus();
    else control?.focus?.();
  }

  private timers(): CountdownClock {
    return this.clock ?? systemTimers;
  }

  private validDocumentId(): string | undefined {
    const id: unknown = this.documentId;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
  }

  private text(): BrandEditorLabels {
    return mergeLabels(BRAND_EDITOR_LABELS, this.labels);
  }

  /** Works out the preview of the draft as it stands, keeping the last valid one when it is not. */
  private showDraft(): void {
    const next = previewOf(this.draft);
    if (next === undefined) {
      if (this.shown?.current === true) this.shown = { ...this.shown, current: false };
      return;
    }
    this.shown = {
      base: next.kit,
      kit: this.withImages(next.kit),
      theme: next.theme,
      current: true,
    };
  }

  private withImages(kit: Omit<DraftPreview["kit"], "logo" | "mark">): Shown["kit"] {
    const { logo, mark } = this.draft;
    return {
      ...kit,
      ...(logo === undefined ? {} : { logo }),
      ...(mark === undefined ? {} : { mark }),
    };
  }

  /** A new logo or mark is shown at once: the theme does not depend on it, so it is not made again. */
  private showImages(): void {
    const shown = this.shown;
    if (shown === undefined) return;
    this.shown = { ...shown, kit: this.withImages(shown.base) };
  }

  private say(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
  }

  private clearError(field: DraftField): void {
    if (this.errors[field] === undefined) return;
    this.errors = without(this.errors, field);
  }

  private edit(field: Exclude<DraftField, ImageField>, value: string): void {
    if (this.draft[field] === value) return;
    this.draft = { ...this.draft, [field]: value };
    this.clearError(field);
    this.refresh.schedule();
  }

  private async choose(field: ImageField, input: HTMLInputElement): Promise<void> {
    const file: UploadFile | undefined = input.files?.[0];
    if (file === undefined) return;
    this.reading = { ...this.reading, [field]: true };
    const outcome = await this.uploads.upload(field, file);
    // A later upload, a removal or the element leaving the page has overtaken this one.
    if (outcome === undefined) return;
    this.reading = { ...this.reading, [field]: false };
    const labels = this.text();
    if (outcome.kind === "refused") {
      // The logo the kit had stays; the input is emptied so the same file can be chosen again.
      input.value = "";
      this.refuseUpload(field, outcome.code, labels);
      return;
    }
    this.draft = { ...this.draft, [field]: outcome.svg };
    this.clearError(field);
    const others = without(this.removals, field);
    this.removals =
      outcome.removedCount === 0
        ? others
        : {
            ...others,
            [field]: {
              removed: outcome.removed,
              count: outcome.removedCount,
              key: (this.keys += 1),
            },
          };
    if (outcome.removedCount === 0) this.say(labels.imageAccepted);
    this.refusedFromKit = this.refusedFromKit.filter((refused) => refused !== field);
    this.showImages();
  }

  private refuseUpload(field: ImageField, code: UploadRefusalCode, labels: BrandEditorLabels) {
    this.errors = { ...this.errors, [field]: message(labels, "upload", code) };
  }

  private removeImage(field: ImageField): void {
    this.uploads.cancel(field);
    this.draft = without(this.draft, field) as BrandDraft;
    this.removals = without(this.removals, field);
    this.reading = { ...this.reading, [field]: false };
    this.clearError(field);
    const input = this.files[field];
    if (input) {
      input.value = "";
      // The remove button goes with the image, so focus goes to the upload it belongs to.
      input.focus();
    }
    this.say(this.text().imageRemoved);
    this.showImages();
  }

  private handleSubmit = (event: globalThis.Event): void => {
    event.preventDefault();
    void this.saveKit();
  };

  private async saveKit(): Promise<void> {
    if (this.pending) return;
    const labels = this.text();
    this.refresh.flush();
    const result = validateDraft(this.draft);
    if (!result.ok) {
      this.errors = Object.fromEntries(
        Object.entries(result.errors).map(([field, code]) => [
          field,
          message(labels, "field", code),
        ]),
      );
      this.summary = { text: labels.errorFields, key: (this.keys += 1) };
      this.focusInvalid = true;
      return;
    }
    const store: unknown = this.store;
    if (!isBrandEditorStore(store)) {
      this.summary = { text: labels.saveNoStore, key: (this.keys += 1) };
      return;
    }
    const attempt = this.attempts.start();
    const documentId = this.storedId;
    this.pending = true;
    this.summary = undefined;
    this.savedKey = 0;
    this.errors = {};
    try {
      const answer =
        documentId === undefined
          ? await store.create(result.kit)
          : await store.update(documentId, result.kit);
      if (!this.attempts.isCurrent(attempt)) return;
      const saved = readSaved(answer);
      if (saved === undefined) {
        if (documentId === undefined) this.adoptCreated(readUnreadDocumentId(answer));
        this.summary = { text: labels.saveUnreadableAnswer, key: (this.keys += 1) };
        return;
      }
      const created = documentId === undefined || this.createdUnreported === saved.documentId;
      this.createdUnreported = undefined;
      this.storedId = saved.documentId;
      this.removals = {};
      this.savedKey = this.keys += 1;
      this.idgSave.emit({ documentId: saved.documentId, id: saved.id, created });
    } catch (error) {
      if (!this.attempts.isCurrent(attempt)) return;
      this.fail(readStoreFailure(error), documentId === undefined, labels);
    } finally {
      if (this.attempts.isCurrent(attempt)) this.pending = false;
    }
  }

  /** A create that stored a kit it could not report: the next save changes that one. */
  private adoptCreated(documentId: string | undefined): void {
    if (documentId === undefined || this.storedId !== undefined) return;
    this.storedId = documentId;
    this.createdUnreported = documentId;
  }

  private fail(failure: StoreFailure, creating: boolean, labels: BrandEditorLabels): void {
    if (creating && failure.code === "not-applied") this.adoptCreated(failure.documentId);
    const onField =
      failure.code === "validation"
        ? labels.fieldRefused
        : failure.code === "not-applied"
          ? labels.fieldNotSaved
          : undefined;
    if (onField !== undefined && failure.fields.length > 0) {
      this.errors = Object.fromEntries(failure.fields.map((field) => [field, onField]));
      this.focusInvalid = true;
    }
    this.summary = { text: message(labels, "save", failure.code), key: (this.keys += 1) };
  }

  private renderText(
    field: "id" | "name" | "tagline",
    label: string,
    labels: BrandEditorLabels,
    options: { hint?: string; maxlength?: number; required: boolean; autocomplete?: string },
  ) {
    return (
      <idg-field
        label={label}
        hint={options.hint}
        error={this.errors[field]}
        required={options.required}
        optionalText={options.required ? undefined : labels.optional}
      >
        <idg-input
          name={controlName(field)}
          type="text"
          value={this.draft[field]}
          maxlength={options.maxlength}
          required={options.required}
          autocomplete={options.autocomplete ?? "off"}
          spellcheck={field === "id" ? "false" : undefined}
          autocapitalize={field === "id" ? "none" : undefined}
          ref={(element) => (this.controls[field] = element)}
          onIdgInput={(event: CustomEvent<{ value: string }>) => {
            this.edit(field, event.detail.value);
          }}
        />
      </idg-field>
    );
  }

  private renderColour(field: ColourField, labels: BrandEditorLabels) {
    const required = field === "primary";
    const name = labels[field];
    const picked = colourPickerValue(this.draft[field]) ?? this.picked[field] ?? "#000000";
    this.picked[field] = picked;
    return (
      <idg-field
        label={name}
        hint={required ? labels.colourHint : labels.optionalColourHint}
        error={this.errors[field]}
        required={required}
        optionalText={required ? undefined : labels.optional}
      >
        <idg-input
          name={controlName(field)}
          type="text"
          value={this.draft[field]}
          maxlength={7}
          required={required}
          autocomplete="off"
          spellcheck="false"
          autocapitalize="none"
          ref={(element) => (this.controls[field] = element)}
          onIdgInput={(event: CustomEvent<{ value: string }>) => {
            this.edit(field, event.detail.value);
          }}
        >
          <input
            slot="start"
            class="picker focusable"
            type="color"
            data-colour={field}
            aria-label={fillTemplate(labels.colourPicker, { colour: name.toLowerCase() })}
            // A picker always holds a colour: while the field holds none it keeps the last it
            // showed (black at first), and choosing one writes its hex into the field.
            value={picked}
            onInput={(event) => {
              this.edit(field, (event.target as HTMLInputElement).value);
            }}
          />
        </idg-input>
      </idg-field>
    );
  }

  private renderChoice(
    field: "typography" | "corners" | "tone",
    label: string,
    options: readonly { readonly value: string; readonly text: string }[],
  ) {
    return (
      <idg-field label={label} error={this.errors[field]} required>
        <idg-select
          name={controlName(field)}
          value={this.draft[field]}
          required
          ref={(element) => (this.controls[field] = element)}
          onIdgChange={(event: CustomEvent<{ value: string }>) => {
            this.edit(field, event.detail.value);
          }}
        >
          {options.map((option) => (
            <option value={option.value}>{option.text}</option>
          ))}
        </idg-select>
      </idg-field>
    );
  }

  private renderImage(field: ImageField, labels: BrandEditorLabels, size: string) {
    const name = labels[field];
    const image = this.draft[field];
    const error = this.errors[field];
    const removals = this.removals[field];
    const fileId = `${field}-file`;
    const hintId = `${field}-hint`;
    const errorId = `${field}-error`;
    const statusId = `${field}-status`;
    return (
      <div class="image" part="image" role="group" aria-labelledby={`${field}-label`}>
        <label class="image-label" id={`${field}-label`} htmlFor={fileId}>
          {name} <span class="optional">{labels.optional}</span>
        </label>
        <p class="hint" id={hintId}>
          {fillTemplate(labels.imageHint, { size })}
        </p>
        <div class="image-row">
          <div class="thumbnail" id={statusId}>
            {image === undefined ? (
              <p class="note">
                {this.refusedFromKit.includes(field)
                  ? labels.kitImageRefused
                  : field === "logo"
                    ? labels.noLogo
                    : labels.noMark}
              </p>
            ) : (
              <idg-brand-logo
                logo={image}
                name={this.draft.name.trim()}
                variant={field}
                size="sm"
              />
            )}
            {this.reading[field] ? <p class="note">{labels.reading}</p> : null}
          </div>
          <input
            id={fileId}
            class="file focusable"
            type="file"
            name={controlName(field)}
            accept="image/svg+xml,.svg"
            aria-describedby={`${hintId} ${statusId} ${errorId}`}
            aria-invalid={error === undefined ? undefined : "true"}
            ref={(element) => {
              this.files[field] = element;
              this.controls[field] = element;
            }}
            onChange={(event) => {
              void this.choose(field, event.target as HTMLInputElement);
            }}
          />
          {image === undefined ? null : (
            <idg-button
              class="remove"
              variant="secondary"
              size="sm"
              data-remove={field}
              onClick={() => {
                this.removeImage(field);
              }}
            >
              {fillTemplate(labels.removeImage, { image: name.toLowerCase() })}
            </idg-button>
          )}
        </div>
        {/* The region exists before an error does, so inserting the message is what is announced. */}
        <div class="error" id={errorId} role="alert">
          {error === undefined ? null : (
            <idg-icon class="error-mark" name="error" aria-hidden="true" />
          )}
          {error === undefined ? null : <span class="error-text">{error}</span>}
        </div>
        {removals === undefined ? null : (
          <RemovalsView
            removals={removals}
            image={name.toLowerCase()}
            labels={labels}
            format={numberFormatter(languageOf(this.host))}
          />
        )}
      </div>
    );
  }

  private renderPreview(labels: BrandEditorLabels) {
    if (!this.preview) return null;
    const level = headingLevel(this.headingLevel, DEFAULT_LEVEL);
    const Heading = `h${String(level)}`;
    const shown = this.shown;
    return (
      <section class="preview" part="preview" aria-labelledby="preview-title">
        <Heading class="preview-title" id="preview-title">
          {labels.previewHeading}
        </Heading>
        {shown === undefined ? (
          <p class="note">{labels.previewEmpty}</p>
        ) : (
          [
            shown.current ? null : <p class="note">{labels.previewStale}</p>,
            <idg-brand-guidelines
              kit={shown.kit}
              theme={shown.theme}
              headingLevel={Math.min(level + 1, 6)}
            />,
          ]
        )}
      </section>
    );
  }

  render() {
    const labels = this.text();
    const format = numberFormatter(languageOf(this.host));
    const size = `${format(SVG_LOGO_LIMITS.inputBytes / 1024)} KB`;
    const typography = FONT_PAIRINGS.map((pairing) => ({ value: pairing.id, text: pairing.label }));
    const corners = CORNERS.map((value) => ({
      value,
      text: { sharp: labels.cornersSharp, soft: labels.cornersSoft, round: labels.cornersRound }[
        value
      ],
    }));
    const tones = TONES.map((value) => ({
      value,
      text: { calm: labels.toneCalm, balanced: labels.toneBalanced, vivid: labels.toneVivid }[
        value
      ],
    }));
    return (
      <div class="editor">
        <form
          class="form"
          part="form"
          noValidate
          aria-label={
            typeof this.label === "string" && this.label !== "" ? this.label : labels.name
          }
          onSubmit={this.handleSubmit}
          ref={containInnerEvents}
        >
          {this.summary === undefined ? null : (
            <idg-alert key={this.summary.key} class="feedback" part="error" variant="danger">
              {this.summary.text}
            </idg-alert>
          )}
          {this.renderText("name", labels.brandName, labels, {
            maxlength: NAME_MAX_LENGTH,
            required: true,
            autocomplete: "organization",
          })}
          {this.renderText("id", labels.id, labels, { hint: labels.idHint, required: true })}
          {this.renderText("tagline", labels.tagline, labels, {
            maxlength: TAGLINE_MAX_LENGTH,
            required: false,
          })}
          <fieldset class="group" part="fieldset">
            <legend class="legend">{labels.coloursLegend}</legend>
            {COLOUR_FIELDS.map((field) => this.renderColour(field, labels))}
          </fieldset>
          <fieldset class="group" part="fieldset">
            <legend class="legend">{labels.styleLegend}</legend>
            {this.renderChoice("typography", labels.typography, typography)}
            {this.renderChoice("corners", labels.corners, corners)}
            {this.renderChoice("tone", labels.tone, tones)}
          </fieldset>
          <fieldset class="group" part="fieldset">
            <legend class="legend">{labels.imagesLegend}</legend>
            {IMAGE_FIELDS.map((field) => this.renderImage(field, labels, size))}
          </fieldset>
          {this.savedKey > 0 ? (
            <idg-alert key={this.savedKey} part="saved" variant="success">
              {labels.saved}
            </idg-alert>
          ) : null}
          <idg-button class="submit" part="submit" type="submit" loading={this.pending}>
            {labels.save}
          </idg-button>
          <p class="visually-hidden" role="status">
            <span>{this.announcement.slot === 0 ? this.announcement.text : ""}</span>
            <span>{this.announcement.slot === 1 ? this.announcement.text : ""}</span>
          </p>
        </form>
        {this.renderPreview(labels)}
      </div>
    );
  }
}

interface RemovalsViewProps {
  readonly removals: Removals;
  readonly image: string;
  readonly labels: BrandEditorLabels;
  readonly format: (value: number) => string;
}

/**
 * What the sanitiser removed from an upload, as sentences, before the kit is saved: the reasons are
 * fixed words, and the element and attribute names are the sanitiser's, which only ever hold ASCII
 * name characters, drawn as text. The list is as long as the sanitiser reports, and the rest counted.
 */
const RemovalsView = ({ removals, image, labels, format }: RemovalsViewProps) => {
  const more = removals.count - removals.removed.length;
  return (
    <idg-alert key={removals.key} class="removals" part="removals" variant="warning">
      <p class="removals-heading">
        {fillTemplate(labels.removalsHeading, { image, count: format(removals.count) })}
      </p>
      <p>{labels.removalsAdvice}</p>
      <ul class="removal-list">
        {removals.removed.map((removal) => (
          <li>
            {fillTemplate(
              removal.attribute === undefined && removal.property === undefined
                ? labels.removal
                : labels.removalAttribute,
              {
                reason: message(labels, "removed", removal.reason),
                element: removal.element,
                attribute: removal.attribute ?? removal.property ?? "",
                line: format(removal.line),
              },
            )}
          </li>
        ))}
        {more > 0 ? <li>{fillTemplate(labels.moreRemovals, { count: format(more) })}</li> : null}
      </ul>
    </idg-alert>
  );
};
