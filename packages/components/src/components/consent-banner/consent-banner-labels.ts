/** The text of idg-consent-banner. Override any of it through `labels`. */
export interface ConsentBannerLabels {
  /** The accessible name of the banner's region. */
  readonly regionName: string;
  /** The question, used when the `message` slot is empty. */
  readonly message: string;
  readonly accept: string;
  readonly decline: string;
  /** The third control, which opens the preferences. */
  readonly choose: string;
  /** Said politely after "Accept analytics". */
  readonly acceptedAnnouncement: string;
  /** Said politely after "Decline". */
  readonly declinedAnnouncement: string;
  /** The one line shown, when asked to, while Global Privacy Control is set. */
  readonly signalGpc: string;
  /** The one line shown, when asked to, while Do Not Track is set. */
  readonly signalDnt: string;
  /** The choice was refused or could not be stored. */
  readonly saveError: string;
  /** The consent state could not be read. */
  readonly unavailable: string;
}

export const CONSENT_BANNER_LABELS: ConsentBannerLabels = {
  regionName: "Analytics choice",
  message:
    "May we count visits to understand how this site is used? Analytics keep a small record in your browser. Nothing is sent unless you accept.",
  accept: "Accept analytics",
  decline: "Decline",
  choose: "Choose",
  acceptedAnnouncement: "Analytics accepted.",
  declinedAnnouncement: "Analytics declined.",
  signalGpc:
    "Your browser's Global Privacy Control signal is on, so analytics are off. We respect it and do not ask.",
  signalDnt:
    "Your browser's Do Not Track signal is on, so analytics are off. We respect it and do not ask.",
  saveError:
    "Your choice could not be saved, so it has not taken effect. Your browser may be blocking storage. Please try again.",
  unavailable: "The analytics choice is not available right now. Analytics stay off.",
};
