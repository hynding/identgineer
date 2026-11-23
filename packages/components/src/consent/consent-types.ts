// The members of the tracker's consent object (`@identgineer/tracking`) the components use,
// declared here and not imported. The SDK is TypeScript source with `.ts` import specifiers, which
// a consumer's compiler cannot read through our declarations (TS5097), and the components never
// load it: the page creates the tracker and hands over `tracker.consent`. `consent-types.test.ts`
// holds the tracker's consent object assignable to `ConsentClient`, so they cannot drift.

export type ConsentStateView = "unknown" | "granted" | "denied";

/** What the tracker acts on. `reason` is set only while a browser privacy signal denies consent. */
export interface ConsentStatusView {
  readonly state: ConsentStateView;
  readonly reason?: "gpc" | "dnt";
  /** When the stored choice was made, as milliseconds since 1970; `null` while none is stored. */
  readonly decidedAt: number | null;
}

/** The browser signals that deny consent whatever was stored. */
export type ConsentSignal = NonNullable<ConsentStatusView["reason"]>;

export interface ConsentClient {
  readonly get: () => ConsentStatusView;
  /** Records the choice; returns whether it could be stored. A browser signal still wins. */
  readonly grant: () => boolean;
  readonly deny: () => boolean;
  /** Forgets the choice, and everything stored for it: the visitor is asked again. */
  readonly reset: () => boolean;
  readonly onChange: (listener: (status: ConsentStatusView) => void) => () => void;
}

/** Detail of `idgConsentChange`: the state the consent is in now. */
export interface ConsentChangeDetail {
  readonly state: ConsentStateView;
}
