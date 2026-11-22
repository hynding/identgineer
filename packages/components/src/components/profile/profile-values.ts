import type { ProfileInputView, ProfileView } from "../../identity/identity-types";
import type { ProfileDetail } from "./profile-types";

/** The values the details form holds when it is sent. */
export interface DetailsValues {
  readonly displayName: string;
  readonly bio: string;
  readonly locale: string;
  readonly timezone: string;
  readonly marketingOptIn: boolean;
}

/**
 * What `saveProfile` is sent. An empty bio clears it; an empty language or time zone is left out,
 * which keeps what is stored (the CMS has no way to clear those).
 */
export function profileInput(values: DetailsValues): ProfileInputView {
  return {
    displayName: values.displayName,
    bio: values.bio === "" ? null : values.bio,
    ...(values.locale === "" ? {} : { locale: values.locale }),
    ...(values.timezone === "" ? {} : { timezone: values.timezone }),
    marketingOptIn: values.marketingOptIn,
  };
}

export function profileDetail(profile: ProfileView): ProfileDetail {
  return {
    displayName: profile.displayName,
    bio: profile.bio,
    locale: profile.locale,
    timezone: profile.timezone,
    marketingOptIn: profile.marketingOptIn,
  };
}

/** The browser's IANA time zones, sorted, with a saved one it does not list kept in. */
export function timeZoneOptions(saved: string | null | undefined): readonly string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const all = saved && !zones.includes(saved) ? [...zones, saved] : [...zones];
  return all.sort();
}
