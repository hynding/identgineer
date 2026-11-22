import { FEEDBACK_LABELS, type FeedbackLabels } from "../../identity/feedback-labels";

/** Every string `idg-register` shows. Pass a partial object as `labels` to translate some. */
export interface RegisterLabels extends FeedbackLabels {
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly showPassword: string;
  readonly submit: string;
  /** Under the password. `{used}` and `{max}` are byte counts. */
  readonly passwordBytes: string;
  readonly passwordTooLong: string;
  readonly usernameRequired: string;
  readonly emailRequired: string;
  readonly passwordRequired: string;
  readonly usernameInvalid: string;
  readonly emailInvalid: string;
  readonly passwordInvalid: string;
  /** The neutral answer: the same whether or not the address was already registered. */
  readonly checkEmail: string;
  /** A backend that confirms no addresses signs the new account in at once. */
  readonly signedIn: string;
}

export const REGISTER_LABELS: RegisterLabels = {
  ...FEEDBACK_LABELS,
  username: "Username",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  submit: "Create account",
  passwordBytes: "{used} of {max} bytes used",
  passwordTooLong:
    "This password is too long. Use at most 72 bytes: letters with accents and emoji count as more than one.",
  usernameRequired: "Choose a username.",
  emailRequired: "Enter your email address.",
  passwordRequired: "Choose a password.",
  usernameInvalid: "Choose another username.",
  emailInvalid: "Enter a valid email address.",
  passwordInvalid: "Choose another password.",
  checkEmail:
    "Check your email. If this address can be used, we have sent it a link to finish creating the account.",
  signedIn: "Your account is ready. You are signed in.",
};
