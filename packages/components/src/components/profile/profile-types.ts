/** The profile fields `idgProfileSaved` carries: what the owner chose to show. */
export interface ProfileDetail {
  readonly displayName: string;
  readonly bio: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly marketingOptIn: boolean;
}

/** Detail of `idgProfileSaved`. */
export interface ProfileSavedDetail {
  readonly profile: ProfileDetail;
}

/** Detail of `idgSessionRevoked`: the id of the session that was signed out. */
export interface SessionRevokedDetail {
  readonly id: string;
}
