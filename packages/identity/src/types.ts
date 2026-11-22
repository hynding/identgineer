/** The signed-in account, as `/api/users/me` and the sign-in answers describe it. */
export interface IdentityUser {
  readonly id: number;
  readonly documentId?: string;
  readonly username: string;
  readonly email: string;
  readonly provider: string;
  readonly confirmed: boolean;
  readonly blocked: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** One of the account's sessions (refresh mode only). */
export interface IdentitySession {
  readonly id: string;
  readonly deviceId?: string;
  readonly deviceName?: string;
  readonly current: boolean;
  readonly loginAt?: string;
  readonly lastActiveAt: string;
}

/** The owner's `Profile` entry. */
export interface Profile {
  readonly documentId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly marketingOptIn: boolean;
}

/** What `saveProfile` writes. Omitted fields keep their stored (or default) value. */
export interface ProfileInput {
  readonly displayName: string;
  readonly bio?: string | null;
  readonly locale?: string;
  readonly timezone?: string;
  readonly marketingOptIn?: boolean;
}
