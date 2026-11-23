import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import {
  DEFAULT_SENTIMENTS,
  DIRECTION_ICONS,
  STAT_DIRECTIONS,
  STAT_SENTIMENTS,
  type StatDirection,
  type StatSentiment,
} from "./stat-options";

/**
 * A figure with its label and, optionally, how it changed.
 *
 * @slot chart - A small chart beside the figures, such as a sparkline.
 * @part label - The label.
 * @part value - The figure.
 * @part delta - The change.
 * @part period - What the change is measured against, when `period` is set.
 */
@Component({
  tag: "idg-stat",
  styleUrls: ["../../styles/visually-hidden.css", "stat.css"],
  shadow: true,
})
export class IdgStat {
  /** What the figure measures. */
  @Prop() label?: string;

  /** The figure, formatted as it should be shown. */
  @Prop() value?: string;

  /** The change, formatted as it should be shown, such as `12%`. */
  @Prop() delta?: string;

  /** Which way the figure moved. Shown as an icon and spoken to screen readers. */
  @Prop() direction: StatDirection = "flat";

  /**
   * Whether the change is good, for the colour. Defaults from the direction, so set it where a
   * rise is bad, such as a churn rate.
   */
  @Prop() sentiment?: StatSentiment;

  /**
   * What the change is measured against, such as `vs previous 7 days`. It is seen beside the change
   * and spoken with it, since a change with no basis is ambiguous. Without a change it is not shown.
   */
  @Prop() period?: string;

  /** Spoken before the change of a figure that rose. */
  @Prop({ attribute: "up-label" }) upLabel = "Increased by";

  /** Spoken before the change of a figure that fell. */
  @Prop({ attribute: "down-label" }) downLabel = "Decreased by";

  /** Spoken before the change of a figure that did not move. */
  @Prop({ attribute: "flat-label" }) flatLabel = "No change";

  private spoken(direction: StatDirection): string {
    const lead = { up: this.upLabel, down: this.downLabel, flat: this.flatLabel }[direction];
    return `${lead} ${this.delta ?? ""} ${this.period ?? ""}`.replace(/\s+/g, " ").trim();
  }

  render() {
    const direction = oneOf(STAT_DIRECTIONS, this.direction, "flat");
    const sentiment = oneOf(STAT_SENTIMENTS, this.sentiment, DEFAULT_SENTIMENTS[direction]);
    return (
      <div class="stat">
        <div class="figures">
          <div class="label" part="label">
            {this.label}
          </div>
          <div class="value" part="value">
            {this.value}
          </div>
          {this.delta === undefined || this.delta === "" ? null : (
            <div class="change">
              <div class={{ delta: true, [`sentiment-${sentiment}`]: true }} part="delta">
                <idg-icon name={DIRECTION_ICONS[direction]} size="sm" aria-hidden="true" />
                <span class="visually-hidden">{this.spoken(direction)}</span>
                <span class="delta-text" aria-hidden="true">
                  {this.delta}
                </span>
              </div>
              {this.period === undefined || this.period === "" ? null : (
                <span class="period" part="period" aria-hidden="true">
                  {this.period}
                </span>
              )}
            </div>
          )}
        </div>
        <slot name="chart" />
      </div>
    );
  }
}
