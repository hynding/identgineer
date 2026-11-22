import { MAX_PASSWORD_BYTES, utf8ByteLength } from "./password-bytes";

/** The words for a new password typed twice. */
export interface NewPasswordLabels {
  readonly newPasswordRequired: string;
  readonly passwordTooLong: string;
  readonly passwordMismatch: string;
}

/**
 * The errors of a new password and its confirmation, by field: missing, over the 72 bytes bcrypt
 * reads, or not the same twice. The SDK would refuse these without naming a field, so they are
 * found here first and shown on the field they concern.
 */
export function newPasswordErrors(
  password: string,
  confirmation: string,
  labels: NewPasswordLabels,
): { password?: string; passwordConfirmation?: string } {
  if (password === "") return { password: labels.newPasswordRequired };
  return {
    ...(utf8ByteLength(password) > MAX_PASSWORD_BYTES ? { password: labels.passwordTooLong } : {}),
    ...(password === confirmation ? {} : { passwordConfirmation: labels.passwordMismatch }),
  };
}

interface FieldErrors {
  readonly fieldErrors: Readonly<Record<string, string>>;
  setFieldError(field: string, message: string | undefined): void;
}

/**
 * While a new password is typed: marks it the moment it passes 72 bytes, and unmarks it once it
 * fits again (an error about anything else stays until the next attempt).
 */
export function markPasswordLength(
  feedback: FieldErrors,
  field: string,
  bytes: number,
  tooLong: string,
): void {
  if (bytes > MAX_PASSWORD_BYTES) feedback.setFieldError(field, tooLong);
  else if (feedback.fieldErrors[field] === tooLong) feedback.setFieldError(field, undefined);
}
