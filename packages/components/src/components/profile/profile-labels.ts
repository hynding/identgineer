import { FEEDBACK_LABELS, type FeedbackLabels } from "../../identity/feedback-labels";
import type { NewPasswordLabels } from "../../identity/new-password";

/** Every string `idg-profile` shows. Pass a partial object as `labels` to translate some. */
export interface ProfileLabels extends FeedbackLabels, NewPasswordLabels {
  readonly detailsHeading: string;
  readonly displayName: string;
  readonly bio: string;
  readonly locale: string;
  readonly localeHint: string;
  readonly timezone: string;
  /** The time zone option that sets none. */
  readonly timezoneNone: string;
  readonly marketingOptIn: string;
  readonly saveProfile: string;
  readonly profileSaved: string;
  readonly displayNameRequired: string;
  readonly displayNameInvalid: string;
  readonly bioInvalid: string;
  readonly localeInvalid: string;
  readonly timezoneInvalid: string;
  readonly passwordHeading: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
  readonly showPassword: string;
  /** Under the new password. `{used}` and `{max}` are byte counts. */
  readonly passwordBytes: string;
  readonly currentPasswordRequired: string;
  readonly passwordUnchanged: string;
  readonly errorCurrentPassword: string;
  readonly changePassword: string;
  readonly passwordChanged: string;
  readonly sessionsHeading: string;
  readonly thisDevice: string;
  readonly unknownDevice: string;
  /** When a session was last used. `{time}` is the date and time. */
  readonly lastActive: string;
  readonly revokeSession: string;
  readonly sessionRevoked: string;
  readonly sessionsUnavailable: string;
  readonly signOutEverywhere: string;
  /** Shown after signing out everywhere could not reach the server. */
  readonly serverUnreachable: string;
  readonly signedOut: string;
  readonly errorUnauthorized: string;
  readonly dismiss: string;
}

export const PROFILE_LABELS: ProfileLabels = {
  ...FEEDBACK_LABELS,
  detailsHeading: "Profile",
  displayName: "Display name",
  bio: "About you",
  locale: "Language",
  localeHint: "A language tag, such as en-GB.",
  timezone: "Time zone",
  timezoneNone: "Not set",
  marketingOptIn: "Send me news and offers by email",
  saveProfile: "Save profile",
  profileSaved: "Profile saved.",
  displayNameRequired: "Enter a display name.",
  displayNameInvalid: "Use at most 80 characters.",
  bioInvalid: "Use at most 500 characters.",
  localeInvalid: "Use a language tag such as en-GB.",
  timezoneInvalid: "Choose a time zone from the list.",
  passwordHeading: "Password",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  showPassword: "Show password",
  passwordBytes: "{used} of {max} bytes used",
  currentPasswordRequired: "Enter your current password.",
  newPasswordRequired: "Choose a new password.",
  passwordTooLong:
    "This password is too long. Use at most 72 bytes: letters with accents and emoji count as more than one.",
  passwordMismatch: "The passwords do not match.",
  passwordUnchanged: "Choose a password different from the current one.",
  errorCurrentPassword: "The current password is not correct.",
  changePassword: "Change password",
  passwordChanged: "Password changed. Your other sessions were signed out.",
  sessionsHeading: "Where you are signed in",
  thisDevice: "This device",
  unknownDevice: "Unknown device",
  lastActive: "Last active {time}",
  revokeSession: "Sign out",
  sessionRevoked: "The session is signed out.",
  sessionsUnavailable: "The list of sessions is not available.",
  signOutEverywhere: "Sign out everywhere",
  serverUnreachable:
    "You are signed out on this device, but the server could not be reached. Your sessions may stay active there until they expire.",
  signedOut: "Sign in to see your profile.",
  errorUnauthorized: "You need to sign in again.",
  dismiss: "Dismiss",
};
