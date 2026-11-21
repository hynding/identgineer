import type { IconName } from "../icon/icon-paths";

export const STAT_DIRECTIONS = ["up", "down", "flat"] as const;
export const STAT_SENTIMENTS = ["positive", "negative", "neutral"] as const;

export type StatDirection = (typeof STAT_DIRECTIONS)[number];
export type StatSentiment = (typeof STAT_SENTIMENTS)[number];

export const DIRECTION_ICONS: Readonly<Record<StatDirection, IconName>> = {
  up: "arrow-up",
  down: "arrow-down",
  flat: "minus",
};

/** What a rise or fall is taken to mean when the page does not say. */
export const DEFAULT_SENTIMENTS: Readonly<Record<StatDirection, StatSentiment>> = {
  up: "positive",
  down: "negative",
  flat: "neutral",
};
