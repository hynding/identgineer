import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { PROGRESS_SIZES, type ProgressSize } from "./progress-options";
import { progressRange } from "./progress-range";

/**
 * How far along some work is. The bar is a native `<progress>`, so its value, maximum and name are
 * the browser's own. Without a value it is indeterminate.
 *
 * @part label - The visible label.
 * @part value - The percentage, when shown.
 * @part control - The native progress element.
 */
@Component({
  tag: "idg-progress",
  styleUrl: "progress.css",
  shadow: true,
})
export class IdgProgress {
  /** What is progressing. Visible, and the bar's accessible name, so it should always be set. */
  @Prop() label?: string;

  /** How much is done. Without it the progress is indeterminate. */
  @Prop() value?: number;

  /** The value that means done. */
  @Prop() max = 100;

  /** Marks work of unknown length, whatever the value. */
  @Prop({ reflect: true }) indeterminate = false;

  /** Shows the percentage beside the label. Only for determinate progress. */
  @Prop({ attribute: "show-value" }) showValue = false;

  /** Bar thickness. */
  @Prop({ reflect: true }) size: ProgressSize = "md";

  render() {
    const size = oneOf(PROGRESS_SIZES, this.size, "md");
    const { value, max } = progressRange(this.value, this.max, this.indeterminate);
    const percent = value === undefined ? undefined : Math.round((value / max) * 100);
    return (
      <div class="progress">
        {this.label === undefined ? null : (
          <div class="header">
            <span class="label" part="label">
              {this.label}
            </span>
            {this.showValue && percent !== undefined ? (
              <span class="value" part="value" aria-hidden="true">
                {`${String(percent)}%`}
              </span>
            ) : null}
          </div>
        )}
        <progress
          class={{ bar: true, [`size-${size}`]: true }}
          part="control"
          value={value}
          max={max}
          aria-label={this.label}
        />
      </div>
    );
  }
}
