import type { IconName } from "../icon/icon-paths";

export const ALERT_VARIANTS = ["info", "success", "warning", "danger"] as const;

export type AlertVariant = (typeof ALERT_VARIANTS)[number];

/** Colour is never the only cue, so every variant has its own icon. */
export const ALERT_ICONS: Readonly<Record<AlertVariant, IconName>> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

/**
 * Warnings and errors interrupt, so they are announced at once (`role="alert"`). Information and
 * success wait for a pause in speech (`role="status"`). Each role carries its own live behaviour,
 * so no `aria-live` is added beside it, which would announce the message twice.
 */
export const ALERT_ROLES: Readonly<Record<AlertVariant, "alert" | "status">> = {
  info: "status",
  success: "status",
  warning: "alert",
  danger: "alert",
};
