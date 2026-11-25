import { Component, Element, h, Prop, State, Watch } from "@stencil/core";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { numberFormatter } from "../../utils/format-number";
import { headingLevel } from "../../utils/heading-level";
import { languageOf } from "../../utils/language";
import { brandLogoSource } from "../brand-logo/brand-logo-source";
import type { BrandSwatchesLabels } from "../brand-swatches/brand-swatches-labels";
import {
  contrastText,
  readSwatchColours,
  SWATCH_SCHEMES,
} from "../brand-swatches/brand-swatches-model";
import { BRAND_GUIDELINES_LABELS, type BrandGuidelinesLabels } from "./brand-guidelines-labels";
import {
  readBackings,
  readCorners,
  readGradients,
  readImage,
  readName,
  readSourceColours,
  readTagline,
  readTone,
  type GuideBacking,
} from "./brand-guidelines-model";
import {
  readAdjustments,
  readNotes,
  type GuideAdjustment,
  type GuideList,
  type GuideNote,
} from "./brand-guidelines-notes";
import { readTypography, type GuideFace } from "./brand-guidelines-typography";
import type { BrandGuidelinesKit, BrandGuidelinesTheme } from "./brand-guidelines-types";

const DEFAULT_LEVEL = 2;
const MAX_LEVEL = 6;

type Format = (value: number) => string;

/**
 * A brand guide for one kit: its name and tagline, its logo and mark on a light and a dark backing,
 * its colours (through `idg-brand-swatches`) and gradient, a specimen of its fonts, its corner
 * radii, its tone, and what the theme generator moved or flagged, each as a headed section.
 *
 * It takes the data `parseBrandKit` and `generateBrandTheme` return and re-derives nothing. All of
 * it is untrusted and none of it is trusted: every string is drawn as text, a colour is drawn only
 * when it is exactly `#rrggbb`, a number only when it is finite and in range, and each value
 * reaches the page as a custom property set through the style API, never as a style string or
 * markup. A part that is missing or malformed is left out. No font is ever loaded: the specimen
 * uses what the page has, and names the families as text.
 *
 * @part guidelines - The article around everything.
 * @part heading - The brand's name.
 * @part tagline - The brand's tagline.
 * @part section - One headed section.
 * @part section-title - A section's heading.
 * @part exhibit - A logo or mark on one backing, with its caption.
 * @part caption - The caption of an exhibit.
 * @part note - A sentence about the logo, or one note or adjustment of the generator.
 * @part tone - The kit's tone in words.
 * @part empty - The message shown when there is nothing to show.
 */
@Component({
  tag: "idg-brand-guidelines",
  styleUrl: "brand-guidelines.css",
  shadow: true,
})
export class IdgBrandGuidelines {
  @Element() host!: HTMLElement;

  /** The kit `parseBrandKit` returned. Set it as a property: it is data, not an attribute. */
  @Prop() kit?: BrandGuidelinesKit;

  /**
   * The theme `generateBrandTheme` returned, or its `document`, which has no corner radii,
   * adjustments or notes. Set it as a property.
   */
  @Prop() theme?: BrandGuidelinesTheme;

  /** The accessible name of the whole. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. */
  @Prop() labels?: Partial<BrandGuidelinesLabels>;

  /** The words of the colour swatches the guide holds. */
  @Prop() swatchLabels?: Partial<BrandSwatchesLabels>;

  /** The level of the brand name's heading, 1 to 6; the sections' headings are one deeper. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_LEVEL;

  @State() private logoDrawn = false;
  @State() private markDrawn = false;

  // Whether the logo component will draw a logo or its fallback reads the whole text again, so it
  // runs when the kit changes and not on every render.
  @Watch("kit")
  protected kitChanged(): void {
    this.logoDrawn = brandLogoSource(readImage(this.kit, "logo")) !== undefined;
    this.markDrawn = brandLogoSource(readImage(this.kit, "mark")) !== undefined;
  }

  componentWillLoad(): void {
    this.kitChanged();
  }

  private renderLogoSection(
    Title: string,
    labels: BrandGuidelinesLabels,
    name: string,
    backings: readonly GuideBacking[],
  ) {
    const assets = [
      {
        id: "logo",
        variant: "logo",
        text: labels.logo,
        logo: readImage(this.kit, "logo"),
        drawn: this.logoDrawn,
        size: "lg",
        missing: labels.noLogo,
      },
      {
        id: "mark",
        variant: "mark",
        text: labels.mark,
        logo: readImage(this.kit, "mark"),
        drawn: this.markDrawn,
        size: "xl",
        missing: labels.noMark,
      },
    ] as const;
    const backingFor = (backing: GuideBacking) =>
      backing.scheme === "light" ? labels.lightBacking : labels.darkBacking;
    const exhibits = assets.flatMap((asset) =>
      (backings.length === 0 ? [undefined] : backings).map((backing) => ({ asset, backing })),
    );
    return (
      <Section name="logo" Title={Title} title={labels.logoHeading}>
        <div class="exhibits">
          {exhibits.map(({ asset, backing }) => {
            const id = `caption-${asset.id}-${backing?.scheme ?? "page"}`;
            const caption =
              backing === undefined
                ? asset.text
                : fillTemplate(labels.logoOn, { asset: asset.text, backing: backingFor(backing) });
            return (
              <div class="exhibit" part="exhibit" role="group" aria-labelledby={id}>
                <div
                  class="tile"
                  data-scheme={backing?.scheme}
                  style={
                    backing && {
                      "--_backing": backing.background,
                      "--_text": backing.text,
                      "--_accent": backing.accent,
                      "--_on-accent": backing.onAccent,
                    }
                  }
                >
                  <idg-brand-logo
                    logo={asset.logo}
                    name={name}
                    variant={asset.variant}
                    size={asset.size}
                  />
                </div>
                <p class="caption" part="caption" id={id}>
                  {caption}
                </p>
              </div>
            );
          })}
        </div>
        {assets
          .filter((asset) => asset.logo === undefined || !asset.drawn)
          .map((asset) => (
            <p class="note" part="note">
              {asset.missing}
            </p>
          ))}
      </Section>
    );
  }

  render() {
    const labels = mergeLabels(BRAND_GUIDELINES_LABELS, this.labels);
    const format = numberFormatter(languageOf(this.host));
    const level = Math.min(headingLevel(this.headingLevel, DEFAULT_LEVEL), MAX_LEVEL);
    const Name = `h${String(level)}`;
    const Title = `h${String(Math.min(level + 1, MAX_LEVEL))}`;
    const kit = this.kit;
    const theme = this.theme;
    const name = readName(kit);
    const tagline = readTagline(kit);
    const backings = readBackings(theme);
    const sourceColours = readSourceColours(kit);
    const hasThemeColours = SWATCH_SCHEMES.some(
      (scheme) => readSwatchColours(theme)[scheme].size > 0,
    );
    const gradients = readGradients(theme);
    const typography = readTypography(kit);
    const corners = readCorners(kit, theme);
    const tone = readTone(kit);
    const notes = readNotes(theme);
    const adjustments = readAdjustments(theme);
    const hasImages = readImage(kit, "logo") !== undefined || readImage(kit, "mark") !== undefined;
    const sections = [
      name !== "" || hasImages ? this.renderLogoSection(Title, labels, name, backings) : null,
      sourceColours.length > 0 || hasThemeColours ? (
        <Section name="colours" Title={Title} title={labels.coloursHeading}>
          {sourceColours.length === 0 ? null : (
            <ul class="source" aria-label={labels.madeFrom}>
              {sourceColours.map((colour) => (
                <li class="source-colour">
                  <span class="chip" aria-hidden="true" style={{ "--_chip": colour.value }} />
                  <span class="details">
                    <span class="role">
                      {
                        {
                          primary: labels.primary,
                          secondary: labels.secondary,
                          neutralTint: labels.neutralTint,
                        }[colour.role]
                      }
                    </span>{" "}
                    <code class="value">{colour.value}</code>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasThemeColours ? (
            <idg-brand-swatches
              theme={theme}
              label={name === "" ? undefined : fillTemplate(labels.swatchesName, { name })}
              labels={this.swatchLabels}
            />
          ) : null}
        </Section>
      ) : null,
      gradients.length > 0 ? (
        <Section name="gradient" Title={Title} title={labels.gradientHeading}>
          <div class="gradients">
            {gradients.map((gradient) => (
              <div class="gradient-item">
                <p class="scheme-name">
                  {gradient.scheme === "light" ? labels.light : labels.dark}
                </p>
                <div
                  class="gradient"
                  aria-hidden="true"
                  style={{ "--_gradient": gradient.value }}
                />
                <ul class="stops">
                  {gradient.stops.map((stop) => (
                    <li>
                      {fillTemplate(labels.gradientStop, {
                        colour: stop.colour,
                        percent: format(stop.percent),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null,
      typography === undefined ? null : (
        <Section name="typography" Title={Title} title={labels.typographyHeading}>
          <p class="pairing">
            <span class="term">{labels.pairing}</span> <span>{typography.label}</span>
          </p>
          <div
            class="specimen"
            style={{
              ...faceStyle("heading", typography.heading),
              ...faceStyle("body", typography.body),
            }}
          >
            <FaceView
              kind="heading"
              title={labels.headingFace}
              sample={labels.headingSample}
              face={typography.heading}
              labels={labels}
              format={format}
            />
            <FaceView
              kind="body"
              title={labels.bodyFace}
              sample={labels.bodySample}
              face={typography.body}
              labels={labels}
              format={format}
            />
          </div>
          <p class="note" part="note">
            {labels.fontNote}
          </p>
        </Section>
      ),
      corners.radii.length === 0 ? null : (
        <Section name="corners" Title={Title} title={labels.cornersHeading}>
          {corners.style === undefined ? null : (
            <p class="corner-style">
              {
                {
                  sharp: labels.cornersSharp,
                  soft: labels.cornersSoft,
                  round: labels.cornersRound,
                }[corners.style]
              }
            </p>
          )}
          <ul class="corners">
            {corners.radii.map((radius) => (
              <li class="corner">
                <div
                  class="corner-shape"
                  aria-hidden="true"
                  style={{ "--_radius": radius.value }}
                />
                <span>
                  {fillTemplate(labels.radius, {
                    name: {
                      sm: labels.radiusSm,
                      md: labels.radiusMd,
                      lg: labels.radiusLg,
                      pill: labels.radiusPill,
                    }[radius.name],
                    value: radius.value,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ),
      tone === undefined ? null : (
        <Section name="tone" Title={Title} title={labels.toneHeading}>
          <p part="tone">
            {
              { calm: labels.toneCalm, balanced: labels.toneBalanced, vivid: labels.toneVivid }[
                tone
              ]
            }
          </p>
        </Section>
      ),
      notes === undefined && adjustments === undefined ? null : (
        <Section name="notes" Title={Title} title={labels.notesHeading}>
          <NotesView notes={notes} adjustments={adjustments} labels={labels} format={format} />
        </Section>
      ),
    ].filter((section) => section !== null);

    return (
      <article
        class="guidelines"
        part="guidelines"
        aria-label={typeof this.label === "string" && this.label !== "" ? this.label : labels.name}
      >
        {name === "" && tagline === "" ? null : (
          <header class="header">
            {name === "" ? null : (
              <Name class="name" part="heading">
                {name}
              </Name>
            )}
            {tagline === "" ? null : (
              <p class="tagline" part="tagline">
                {tagline}
              </p>
            )}
          </header>
        )}
        {sections.length === 0 && name === "" && tagline === "" ? (
          <p class="empty" part="empty">
            {labels.empty}
          </p>
        ) : (
          sections
        )}
      </article>
    );
  }
}

interface SectionProps {
  name: string;
  Title: string;
  title: string;
}

const Section = ({ name, Title, title }: SectionProps, children: unknown) => {
  const id = `title-${name}`;
  return (
    <section class="section" part="section" data-section={name} aria-labelledby={id}>
      <Title class="section-title" part="section-title" id={id}>
        {title}
      </Title>
      {children}
    </section>
  );
};

function faceStyle(kind: "heading" | "body", face: GuideFace): Record<string, string> {
  const style: Record<string, string> = {};
  if (face.stack !== "") style[`--_${kind}-family`] = face.stack;
  if (face.weight !== undefined) style[`--_${kind}-weight`] = String(face.weight);
  if (face.letterSpacing !== undefined) style[`--_${kind}-spacing`] = face.letterSpacing;
  if (face.lineHeight !== undefined) style[`--_${kind}-line`] = String(face.lineHeight);
  return style;
}

interface FaceViewProps {
  kind: "heading" | "body";
  title: string;
  sample: string;
  face: GuideFace;
  labels: BrandGuidelinesLabels;
  format: Format;
}

const FaceView = ({ kind, title, sample, face, labels, format }: FaceViewProps) => {
  const metrics = [
    face.weight === undefined
      ? undefined
      : fillTemplate(labels.weight, { weight: format(face.weight) }),
    face.lineHeight === undefined
      ? undefined
      : fillTemplate(labels.lineHeight, { lineHeight: format(face.lineHeight) }),
    face.letterSpacing === undefined
      ? undefined
      : fillTemplate(labels.letterSpacing, { letterSpacing: face.letterSpacing }),
  ].filter((metric) => metric !== undefined);
  return (
    <div class="face">
      <p class="face-title">{title}</p>
      <p class={`sample sample-${kind}`}>{sample}</p>
      <p class="stack">
        <code>{face.families.join(", ")}</code>
      </p>
      <ul class="metrics">
        {metrics.map((metric) => (
          <li>{metric}</li>
        ))}
      </ul>
    </div>
  );
};

interface NotesViewProps {
  notes: GuideList<GuideNote> | undefined;
  adjustments: GuideList<GuideAdjustment> | undefined;
  labels: BrandGuidelinesLabels;
  format: Format;
}

const NotesView = ({ notes, adjustments, labels, format }: NotesViewProps) => {
  const sentenceScheme = (scheme: "light" | "dark") =>
    scheme === "light" ? labels.sentenceLight : labels.sentenceDark;
  const noteText = (note: GuideNote) =>
    note.kind === "status-near-accent"
      ? fillTemplate(labels.noteStatusNearAccent, {
          scheme: sentenceScheme(note.scheme),
          role: note.role,
          distance: format(note.figure),
        })
      : fillTemplate(labels.noteAccentBlends, {
          scheme: sentenceScheme(note.scheme),
          ratio: contrastText(note.figure, format),
          against: note.against,
        });
  const origins = {
    primary: labels.originPrimary,
    secondary: labels.originSecondary,
    generated: labels.originGenerated,
  };
  const adjustmentText = (adjustment: GuideAdjustment) =>
    fillTemplate(labels.adjustment, {
      scheme: sentenceScheme(adjustment.scheme),
      role: adjustment.role,
      origin: origins[adjustment.origin],
      requested: adjustment.requested,
      used: adjustment.used,
      minimum: format(adjustment.minimum),
      against: adjustment.against,
      before: contrastText(adjustment.before, format),
      after: contrastText(adjustment.after, format),
    });
  const nothing = (notes?.items.length ?? 0) + (adjustments?.items.length ?? 0) === 0;
  return (
    <div class="notes">
      {nothing ? (
        <p class="note" part="note">
          {labels.nothingMoved}
        </p>
      ) : null}
      {notes === undefined || notes.items.length === 0 ? null : (
        <div class="notes-group">
          <p class="subhead" id="subhead-notes">
            {labels.notesSubheading}
          </p>
          <ul class="notes-list" aria-labelledby="subhead-notes">
            {notes.items.map((note) => (
              <li part="note">{noteText(note)}</li>
            ))}
            {notes.omitted === 0 ? null : (
              <li>{fillTemplate(labels.more, { count: format(notes.omitted) })}</li>
            )}
          </ul>
        </div>
      )}
      {adjustments === undefined || adjustments.items.length === 0 ? null : (
        <div class="notes-group">
          <p class="subhead" id="subhead-adjustments">
            {labels.adjustmentsSubheading}
          </p>
          <ul class="adjustments" aria-labelledby="subhead-adjustments">
            {adjustments.items.map((adjustment) => (
              <li part="note">{adjustmentText(adjustment)}</li>
            ))}
            {adjustments.omitted === 0 ? null : (
              <li>{fillTemplate(labels.more, { count: format(adjustments.omitted) })}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
