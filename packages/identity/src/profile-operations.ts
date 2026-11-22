import type { ClientContext } from "./client-context.ts";
import { documentSegment } from "./identifiers.ts";
import { requireValid } from "./input-checks.ts";
import { failureOf } from "./map-error.ts";
import { readProfile, readProfileList } from "./shapes.ts";
import type { Profile, ProfileInput } from "./types.ts";

const PROFILES_PATH = "/api/profiles";
const PROFILE_FIELDS = ["displayName", "bio", "locale", "timezone", "marketingOptIn"] as const;

// The Profile content type's limits in cms/camis.json.
const LOCALE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
const TIMEZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/;

const fits = (value: unknown, maxLength: number, pattern?: RegExp): boolean =>
  typeof value === "string" && value.length <= maxLength && (pattern?.test(value) ?? true);

const optional = (value: unknown, check: (present: unknown) => boolean): boolean =>
  value === undefined || check(value);

const checkProfile = (input: ProfileInput): void => {
  requireValid(
    {
      displayName: fits(input.displayName, 80) && input.displayName.trim() !== "",
      bio: optional(input.bio, (bio) => bio === null || fits(bio, 500)),
      locale: optional(input.locale, (locale) => fits(locale, 35, LOCALE)),
      timezone: optional(input.timezone, (timezone) => fits(timezone, 64, TIMEZONE)),
      marketingOptIn: optional(input.marketingOptIn, (optIn) => typeof optIn === "boolean"),
    },
    { nameFields: true },
  );
};

/** Only the profile's own fields: an owner or id sent by the caller is never passed on. */
const dataOf = (input: ProfileInput): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.hasOwn(input, field) && input[field] !== undefined) data[field] = input[field];
  }
  return data;
};

export const getProfile = (context: ClientContext) => async (): Promise<Profile | null> => {
  const response = await context.authorizedRequest({ method: "GET", path: PROFILES_PATH });
  if (!response.ok) throw failureOf(response, context.clock.now());
  return readProfileList(response.body);
};

/** Creates the owner's profile, or updates it when there is one. The server sets the owner. */
export const saveProfile =
  (context: ClientContext) =>
  async (input: ProfileInput): Promise<Profile> => {
    checkProfile(input);
    const existing = await getProfile(context)();
    const body = { data: dataOf(input) };
    const response = await context.authorizedRequest(
      existing === null
        ? { method: "POST", path: PROFILES_PATH, body }
        : { method: "PUT", path: `${PROFILES_PATH}/${documentSegment(existing.documentId)}`, body },
    );
    if (!response.ok) throw failureOf(response, context.clock.now(), PROFILE_FIELDS);
    return readProfile(response.body);
  };
