import type { ClientContext } from "./client-context.ts";
import { documentSegment } from "./identifiers.ts";
import { isTextWithin, requireObject, requireValid } from "./input-checks.ts";
import { IdentityError } from "./identity-error.ts";
import { failureOf } from "./map-error.ts";
import { readProfile, readProfileList } from "./shapes.ts";
import type { ApiResponse } from "./transport.ts";
import type { Profile, ProfileInput } from "./types.ts";

const PROFILES_PATH = "/api/profiles";
const PROFILE_FIELDS = ["displayName", "bio", "locale", "timezone", "marketingOptIn"] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];

// The CMS stores the locale as `language`: camis reserves `locale` for Strapi's own. Callers keep
// `locale`, and this is the only place that knows the difference.
const WIRE_NAMES: Readonly<Record<ProfileField, string>> = {
  displayName: "displayName",
  bio: "bio",
  locale: "language",
  timezone: "timezone",
  marketingOptIn: "marketingOptIn",
};
const wireNameOf = (field: ProfileField): string => WIRE_NAMES[field];
const fieldOfWireName = (name: string): ProfileField | undefined =>
  PROFILE_FIELDS.find((field) => WIRE_NAMES[field] === name);

// The Profile content type's limits in cms/camis.json.
const LOCALE = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
const TIMEZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/;

const fits = (value: unknown, maxLength: number, pattern?: RegExp): boolean =>
  isTextWithin(value, maxLength) && (pattern?.test(value) ?? true);

const optional = (value: unknown, check: (present: unknown) => boolean): boolean =>
  value === undefined || check(value);

const checkProfile = (input: ProfileInput): void => {
  requireObject(input);
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
    if (Object.hasOwn(input, field) && input[field] !== undefined) {
      data[wireNameOf(field)] = input[field];
    }
  }
  return data;
};

/** A failed answer, with the input fields it names given as the caller knows them. */
const profileFailure = (response: ApiResponse, now: number): IdentityError => {
  const failure = failureOf(response, now, PROFILE_FIELDS.map(wireNameOf));
  if (failure.fields === undefined) return failure;
  const fields = failure.fields.flatMap((name) => fieldOfWireName(name) ?? []);
  return new IdentityError("validation", { fields });
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
    if (!response.ok) throw profileFailure(response, context.clock.now());
    return readProfile(response.body);
  };
