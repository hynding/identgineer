/** The user preferences that override every design language and UX mode, in emission order. */
export const PREFERENCE_MEDIA = {
  "reduced-motion": "(prefers-reduced-motion: reduce)",
  "more-contrast": "(prefers-contrast: more)",
  "forced-colors": "(forced-colors: active)",
} as const;

export type PreferenceGroupName = keyof typeof PREFERENCE_MEDIA;

export const PREFERENCE_GROUP_NAMES = Object.keys(PREFERENCE_MEDIA) as PreferenceGroupName[];
