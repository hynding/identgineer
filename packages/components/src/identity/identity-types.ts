// The members of the identity client (`@identgineer/identity`) the components use, declared here
// and not imported. The SDK is TypeScript source with `.ts` import specifiers, which a consumer's
// compiler cannot read through our declarations (TS5097), and the components never load it: the
// page creates the client and hands it over. `identity-types.test.ts` holds the SDK's client
// assignable to every interface below, so they cannot drift.

/** The codes an identity error carries, in the SDK's order. */
export const IDENTITY_ERROR_CODES = [
  "invalid-credentials",
  "throttled",
  "network",
  "validation",
  "unauthorized",
  "email-not-confirmed",
  "unknown",
] as const;

export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

/** Why the client is signed out. */
export type SignOutReason = "user" | "expired" | "other-tab" | "no-session" | "user-changed";

/** The fields of the signed-in account the components show. */
export interface IdentityUserView {
  readonly id: number;
  readonly username: string;
  readonly email: string;
}

export type IdentityStateView =
  | { readonly status: "unknown" }
  | { readonly status: "signed-out"; readonly reason: SignOutReason }
  | { readonly status: "signed-in"; readonly user: IdentityUserView };

export type IdentityStatus = IdentityStateView["status"];

/** What `signOut` resolves to. `superseded`: another tab's newer sign-in stands. */
export interface SignOutOutcome {
  readonly outcome: "signed-out" | "server-unreachable" | "superseded";
}

export type RegisterOutcome =
  | { readonly outcome: "check-email" }
  | { readonly outcome: "signed-in"; readonly user: IdentityUserView };

export interface ProfileView {
  readonly documentId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly marketingOptIn: boolean;
}

export interface ProfileInputView {
  readonly displayName: string;
  readonly bio?: string | null;
  readonly locale?: string;
  readonly timezone?: string;
  readonly marketingOptIn?: boolean;
}

export interface SessionView {
  readonly id: string;
  readonly deviceName?: string;
  readonly current: boolean;
  readonly lastActiveAt: string;
}

/** The client's state, and a way to hear every change of it. */
export interface StateSource {
  readonly getState: () => IdentityStateView;
  readonly subscribe: (listener: (state: IdentityStateView) => void) => () => void;
}

/** Seconds until credential requests are accepted again, for the countdown. */
export interface ThrottleSource {
  readonly retryAfterSeconds: () => number;
}

export interface SignInClient extends ThrottleSource {
  readonly signIn: (input: {
    readonly identifier: string;
    readonly password: string;
  }) => Promise<IdentityUserView>;
  readonly providerSignInUrl: (
    provider: string,
    options?: { readonly callback?: string },
  ) => string;
}

export interface RegisterClient extends ThrottleSource {
  readonly register: (input: {
    readonly username: string;
    readonly email: string;
    readonly password: string;
  }) => Promise<RegisterOutcome>;
}

export interface PasswordResetClient extends ThrottleSource {
  readonly requestPasswordReset: (input: { readonly email: string }) => Promise<unknown>;
  readonly resetPassword: (input: {
    readonly code: string;
    readonly password: string;
    readonly passwordConfirmation: string;
  }) => Promise<IdentityUserView>;
}

export interface SignOutSource {
  readonly signOut: (options?: { readonly everywhere?: boolean }) => Promise<SignOutOutcome>;
}

export interface ProfileClient extends StateSource, ThrottleSource, SignOutSource {
  readonly getProfile: () => Promise<ProfileView | null>;
  readonly saveProfile: (input: ProfileInputView) => Promise<ProfileView>;
  readonly changePassword: (input: {
    readonly currentPassword: string;
    readonly password: string;
    readonly passwordConfirmation: string;
  }) => Promise<void>;
  readonly listSessions: () => Promise<readonly SessionView[]>;
  readonly revokeSession: (id: string) => Promise<void>;
}

/** Resumes the session from the refresh cookie; called once while the state is unknown. */
export interface RestoreSource {
  readonly restore: () => Promise<unknown>;
}

export interface SessionGuardClient extends StateSource, RestoreSource {}

export interface UserMenuClient extends StateSource, RestoreSource, SignOutSource {}
