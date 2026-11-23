import { fillTemplate } from "../../identity/labels";
import type { SparklineSummary, Trend } from "./sparkline-values";

/**
 * The words of idg-sparkline's text alternative. Override any of them through `labels`; the
 * placeholders in braces are filled in where a default has them.
 */
export interface SparklineLabels {
  /** The accessible name: `{label}` is the sparkline's label, `{summary}` one of the sentences below. */
  readonly named: string;
  /** For several values: `{first}`, `{last}`, `{lowest}`, `{highest}` and `{trend}`. */
  readonly summary: string;
  /** For a single value: `{value}`. */
  readonly single: string;
  readonly empty: string;
  readonly rising: string;
  readonly falling: string;
  readonly steady: string;
}

export const SPARKLINE_LABELS: SparklineLabels = {
  named: "{label}: {summary}",
  summary: "From {first} to {last}, lowest {lowest}, highest {highest}, {trend}.",
  single: "One value, {value}.",
  empty: "No data.",
  rising: "rising",
  falling: "falling",
  steady: "steady",
};

/**
 * What a sparkline says to someone who cannot see it: its label, then where the series began and
 * ended, how far it ranged and which way it went. Without a label, the summary alone.
 */
export function describeSparkline(
  label: string,
  summary: SparklineSummary | undefined,
  labels: SparklineLabels,
  format: (value: number) => string,
): string {
  const trend: Record<Trend, string> = {
    rising: labels.rising,
    falling: labels.falling,
    steady: labels.steady,
  };
  let sentence = labels.empty;
  if (summary?.count === 1)
    sentence = fillTemplate(labels.single, { value: format(summary.first) });
  else if (summary) {
    sentence = fillTemplate(labels.summary, {
      first: format(summary.first),
      last: format(summary.last),
      lowest: format(summary.lowest),
      highest: format(summary.highest),
      trend: trend[summary.trend],
    });
  }
  return label === "" ? sentence : fillTemplate(labels.named, { label, summary: sentence });
}
