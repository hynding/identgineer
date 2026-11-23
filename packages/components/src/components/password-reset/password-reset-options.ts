export const PASSWORD_RESET_MODES = ["request", "complete"] as const;

/** `request` asks for the email; `complete` sets the new password with the emailed code. */
export type PasswordResetMode = (typeof PASSWORD_RESET_MODES)[number];
