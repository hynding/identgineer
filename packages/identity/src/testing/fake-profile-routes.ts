import { notFound, ok, strapiError, validationError, type FieldError } from "./fake-http.ts";
import type { FakeRoute, RouteContext } from "./fake-route.ts";
import type { FakeProfile } from "./fake-store.ts";

type Check = (value: unknown) => string | undefined;

const string =
  (maxLength: number, pattern?: RegExp): Check =>
  (value) => {
    if (value === null) return undefined;
    if (typeof value !== "string") return "must be a string";
    if (value.length > maxLength) return `must be at most ${String(maxLength)} characters`;
    if (pattern !== undefined && !pattern.test(value)) return "must match the pattern";
    return undefined;
  };

// The Profile fields of cms/camis.json.
const FIELDS: Readonly<Record<string, Check>> = {
  displayName: (value) =>
    value === null || value === "" ? "displayName is a required field" : string(80)(value),
  bio: string(500),
  locale: string(35, /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/),
  timezone: string(64, /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/),
  marketingOptIn: (value) => (typeof value === "boolean" ? undefined : "must be a boolean"),
};

const DEFAULTS = { bio: null, locale: "en", timezone: "UTC", marketingOptIn: false };

const checkData = (context: RouteContext, creating: boolean) => {
  const data: unknown = context.jsonBody().data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {
      failure: strapiError(400, "ValidationError", 'Missing "data" payload in the request body'),
    };
  }
  const values = data as Readonly<Record<string, unknown>>;
  const unknownKey = Object.keys(values).find((key) => !(key in FIELDS));
  if (unknownKey !== undefined) {
    return { failure: strapiError(400, "ValidationError", `Invalid key ${unknownKey}`) };
  }
  const errors: FieldError[] = Object.entries(FIELDS).flatMap(([field, check]) => {
    if (!(field in values)) {
      return creating && field === "displayName"
        ? [{ field, message: "displayName is a required field" }]
        : [];
    }
    const message = check(values[field]);
    return message === undefined ? [] : [{ field, message }];
  });
  return errors.length === 0 ? { values } : { failure: validationError(errors) };
};

const wire = (profile: FakeProfile) => ({
  id: profile.id,
  documentId: profile.documentId,
  ...profile.values,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const list: FakeRoute = {
  method: "GET",
  path: /^\/api\/profiles$/,
  authenticated: true,
  handle: (context) => {
    const own = [...context.store.profiles.values()].filter(
      (profile) => profile.ownerId === context.user().id,
    );
    return ok({
      data: own.map(wire),
      meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: own.length } },
    });
  },
};

const create: FakeRoute = {
  method: "POST",
  path: /^\/api\/profiles$/,
  authenticated: true,
  handle: (context) => {
    const { failure, values } = checkData(context, true);
    if (values === undefined) return failure;
    const ownerId = context.user().id;
    const { store } = context;
    if ([...store.profiles.values()].some((profile) => profile.ownerId === ownerId)) {
      return validationError([{ field: "owner", message: "This attribute must be unique" }]);
    }
    const id = store.next();
    const profile: FakeProfile = {
      id,
      documentId: `profile${String(id)}`,
      ownerId,
      values: { ...DEFAULTS, ...values },
    };
    store.profiles.set(id, profile);
    return { status: 201, body: { data: wire(profile), meta: {} } };
  },
};

const update: FakeRoute = {
  method: "PUT",
  path: /^\/api\/profiles\/([^/]+)$/,
  authenticated: true,
  handle: (context) => {
    const documentId = decodeURIComponent(context.params[0] ?? "");
    const profile = [...context.store.profiles.values()].find(
      (candidate) => candidate.documentId === documentId && candidate.ownerId === context.user().id,
    );
    if (profile === undefined) return notFound();
    const { failure, values } = checkData(context, false);
    if (values === undefined) return failure;
    profile.values = { ...profile.values, ...values };
    return ok({ data: wire(profile), meta: {} });
  },
};

export const PROFILE_ROUTES: readonly FakeRoute[] = [list, create, update];
