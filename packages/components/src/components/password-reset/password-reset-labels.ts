import { FEEDBACK_LABELS, type FeedbackLabels } from "../../identity/feedback-labels";
import type { NewPasswordLabels } from "../../identity/new-password";

/** Every string `idg-password-reset` shows. Pass a partial object as `labels` to translate some. */
export interface PasswordResetLabels extends FeedbackLabels, NewPasswordLabels {
  readonly email: string;
  readonly requestSubmit: string;
  readonly emailRequired: string;
  readonly emailInvalid: string;
  /** The neutral answer: the same whether or not an account uses the address. */
  readonly requestSent: string;
  readonly code: string;
  readonly codeRequired: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
  readonly showPassword: string;
  /** Under the new password. `{used}` and `{max}` are byte counts. */
  readonly passwordBytes: string;
  readonly completeSubmit: string;
  /** A wrong, used or expired code. */
  readonly errorInvalidCode: string;
  readonly passwordReset: string;
}

export const PASSWORD_RESET_LABELS: PasswordResetLabels = {
  ...FEEDBACK_LABELS,
  email: "Email",
  requestSubmit: "Send reset link",
  emailRequired: "Enter your email address.",
  emailInvalid: "Enter a valid email address.",
  requestSent:
    "If an account uses this address, we have sent it a link to reset the password. Check your email.",
  code: "Reset code",
  codeRequired: "Enter the code from the email.",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  showPassword: "Show password",
  passwordBytes: "{used} of {max} bytes used",
  newPasswordRequired: "Choose a new password.",
  passwordTooLong:
    "This password is too long. Use at most 72 bytes: letters with accents and emoji count as more than one.",
  passwordMismatch: "The passwords do not match.",
  completeSubmit: "Set new password",
  errorInvalidCode: "This reset link is not valid or has expired. Ask for a new one.",
  passwordReset: "Your password is changed and you are signed in.",
};
