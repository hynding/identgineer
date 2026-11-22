import { FEEDBACK_LABELS, type FeedbackLabels } from "../../identity/feedback-labels";

/** Every string `idg-sign-in` shows. Pass a partial object as `labels` to translate some. */
export interface SignInLabels extends FeedbackLabels {
  readonly identifier: string;
  readonly password: string;
  readonly showPassword: string;
  readonly submit: string;
  /** The heading above the provider buttons. */
  readonly providersHeading: string;
  /** A provider button. `{provider}` is the provider's label. */
  readonly provider: string;
  /** Announced after a sign-in. */
  readonly signedIn: string;
  readonly identifierRequired: string;
  readonly passwordRequired: string;
  /** Every failed sign-in, whatever the cause, so it never tells whether an account exists. */
  readonly errorInvalidCredentials: string;
  readonly errorEmailNotConfirmed: string;
}

export const SIGN_IN_LABELS: SignInLabels = {
  ...FEEDBACK_LABELS,
  identifier: "Email or username",
  password: "Password",
  showPassword: "Show password",
  submit: "Sign in",
  providersHeading: "Or sign in with",
  provider: "Continue with {provider}",
  signedIn: "Signed in.",
  identifierRequired: "Enter your email or username.",
  passwordRequired: "Enter your password.",
  errorInvalidCredentials: "The email, username or password is not correct.",
  errorEmailNotConfirmed:
    "Confirm your email address before signing in. Check your inbox for the link.",
};
