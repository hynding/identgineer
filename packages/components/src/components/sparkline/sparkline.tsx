import { Component, Element, h, Prop } from "@stencil/core";
import { mergeLabels } from "../../identity/labels";
import { numberFormatter } from "../../utils/format-number";
import { languageOf } from "../../utils/language";
import { VIEW_HEIGHT, VIEW_WIDTH, sparklineShape } from "./sparkline-geometry";
import { SPARKLINE_LABELS, describeSparkline, type SparklineLabels } from "./sparkline-labels";
import { downsample, parseValues, summarise } from "./sparkline-values";

/** The most points drawn. A series of a million values draws as many as one of this many. */
const MAX_POINTS = 120;

/**
 * A small trend line drawn as SVG from a series of numbers, for beside a figure. It scales to the
 * width of its container (set one with the page's own CSS, `idg-sparkline { inline-size: 8rem }`),
 * keeps its proportions, and never animates. It is an image with a text alternative: the label
 * you give it and a sentence with the first, last, lowest and highest value and which way the
 * series went, formatted in the language of the page. Time runs left to right in every
 * writing direction.
 *
 * Anything in `values` that is not a finite number is left out, never drawn as zero. A series
 * longer than 120 points is thinned for drawing, keeping its first, last, lowest and highest.
 *
 * @part chart - The svg element.
 * @part area - The fill under the line, when `area` is set.
 * @part line - The line.
 * @part end - The mark on the last value, so the end of the line is not shown by colour alone.
 */
@Component({
  tag: "idg-sparkline",
  styleUrl: "sparkline.css",
  shadow: true,
})
export class IdgSparkline {
  @Element() host!: HTMLElement;

  /**
   * The series: an array of numbers, or, from an attribute, a JSON array or numbers separated by
   * commas. A text longer than 200,000 characters is read as far as there.
   */
  @Prop() values?: number[] | string;

  /** What the series measures, such as `Visitors`. It is the accessible name, so give it one. */
  @Prop() label?: string;

  /** Fills the area under the line. */
  @Prop({ reflect: true }) area = false;

  /** The words of the text alternative, merged over the English defaults. */
  @Prop() labels?: Partial<SparklineLabels>;

  render() {
    const series = parseValues(this.values);
    const summary = summarise(series);
    const shape = sparklineShape(downsample(series, MAX_POINTS));
    const label = typeof this.label === "string" ? this.label : "";
    const text = describeSparkline(
      label,
      summary,
      mergeLabels(SPARKLINE_LABELS, this.labels),
      numberFormatter(languageOf(this.host)),
    );
    return (
      <svg
        class="chart"
        part="chart"
        viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
        role="img"
        aria-label={text}
        focusable="false"
      >
        {this.area && shape.area !== "" ? <path class="area" part="area" d={shape.area} /> : null}
        {shape.line === "" ? null : <path class="line" part="line" d={shape.line} />}
        {shape.end ? (
          <circle class="end" part="end" cx={shape.end.x} cy={shape.end.y} r="2.5" />
        ) : null}
      </svg>
    );
  }
}
