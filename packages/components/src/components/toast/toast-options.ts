import type { IconName } from "../icon/icon-paths";

export const TOAST_VARIANTS = ["neutral", "info", "success", "warning", "danger"] as const;

export type ToastVariant = (typeof TOAST_VARIANTS)[number];

/** A neutral toast is plain news, so only the status variants carry an icon. */
export const TOAST_ICONS: Readonly<Partial<Record<ToastVariant, IconName>>> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
};

/** How long a toast without an action stays, in milliseconds, unless it is given a duration. */
export const DEFAULT_TOAST_DURATION_MS = 6000;

/** Why a toast went away. */
export type ToastDismissReason = "timeout" | "close-button" | "action" | "escape" | "swipe" | "api";

export interface ToastDismissDetail {
  reason: ToastDismissReason;
}
