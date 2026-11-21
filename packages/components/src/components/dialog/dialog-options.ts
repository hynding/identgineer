export const DIALOG_SIZES = ["sm", "md", "lg", "full"] as const;

export type DialogSize = (typeof DIALOG_SIZES)[number];

/** Why a dialog closed. */
export type DialogCloseReason = "escape" | "backdrop" | "close-button" | "method" | "form";

/** The ways a user can dismiss a dialog, each of which can be refused with `idgCancel`. */
export type DialogCancelReason = Extract<DialogCloseReason, "escape" | "backdrop" | "close-button">;

export interface DialogOpenDetail {
  modal: boolean;
}

export interface DialogCloseDetail {
  returnValue: string;
  reason: DialogCloseReason;
}

export interface DialogCancelDetail {
  reason: DialogCancelReason;
}
