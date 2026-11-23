/**
 * The text of idg-consent-preferences. Override any of it through `labels`. `{time}` is filled in
 * where the default has it.
 */
export interface ConsentPreferencesLabels {
  /** The heading, and the name of the dialog when `modal` is set. */
  readonly title: string;
  readonly intro: string;
  readonly necessaryTitle: string;
  /** Next to the title: the row has no switch, since it cannot be turned off. */
  readonly necessaryState: string;
  /** Says why the row is on and cannot be changed, and that it is not tracked. */
  readonly necessaryDescription: string;
  readonly analyticsTitle: string;
  readonly analyticsDescription: string;
  /** Shown, with the switch off and disabled, while Global Privacy Control is set. */
  readonly signalGpc: string;
  /** Shown, with the switch off and disabled, while Do Not Track is set. */
  readonly signalDnt: string;
  /** When the choice was made; `{time}` is the formatted time. */
  readonly decided: string;
  readonly save: string;
  readonly erase: string;
  readonly eraseQuestion: string;
  readonly eraseConfirm: string;
  readonly eraseCancel: string;
  /** The stored choice changed somewhere else while there was an unsaved edit. */
  readonly changedElsewhere: string;
  /** Said politely when the dialog is closed without saving and an edit is dropped. */
  readonly discarded: string;
  /** Said politely when the choice changes elsewhere while the erase question is open. */
  readonly eraseDismissed: string;
  readonly savedOn: string;
  readonly savedOff: string;
  readonly erased: string;
  readonly saveError: string;
  readonly eraseError: string;
  /** The consent state could not be read. */
  readonly unavailable: string;
  /** The close button of the dialog, when `modal` is set. */
  readonly close: string;
}

export const CONSENT_PREFERENCES_LABELS: ConsentPreferencesLabels = {
  title: "Privacy preferences",
  intro: "Choose what this site may record about your visit. Nothing changes until you save.",
  necessaryTitle: "Necessary",
  necessaryState: "Always on",
  necessaryDescription:
    "Always on. This is what the site needs to work, and it is not tracked or measured.",
  analyticsTitle: "Analytics",
  analyticsDescription:
    "Counts page views and the events this site lists, without your name or email. Off until you turn it on.",
  signalGpc:
    "Analytics are off because your browser's Global Privacy Control signal is on. Turn the signal off in your browser to choose.",
  signalDnt:
    "Analytics are off because your browser's Do Not Track signal is on. Turn the signal off in your browser to choose.",
  decided: "Your choice was made on {time}.",
  save: "Save preferences",
  erase: "Withdraw consent and erase",
  eraseQuestion:
    "Withdraw your consent and erase what analytics stored in this browser? You will be asked again.",
  eraseConfirm: "Yes, withdraw and erase",
  eraseCancel: "Keep my choice",
  changedElsewhere:
    "Your choice changed in another tab or place, so your unsaved change was discarded.",
  discarded: "Changes were not saved.",
  eraseDismissed: "Your choice was changed elsewhere, so the question about erasing was closed.",
  savedOn: "Preferences saved. Analytics are on.",
  savedOff: "Preferences saved. Analytics are off.",
  erased: "Your consent is withdrawn and what analytics stored in this browser is erased.",
  saveError:
    "Your preferences could not be saved, so nothing has changed. Your browser may be blocking storage. Please try again.",
  eraseError:
    "Your choice could not be erased. Your browser may be blocking storage. Please try again.",
  unavailable: "The analytics choice is not available right now. Analytics stay off.",
  close: "Close",
};
