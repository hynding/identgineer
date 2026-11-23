import { IdentityError } from "./identity-error.ts";
import type { IdentitySession, IdentityUser, Profile } from "./types.ts";

type Fields = Readonly<Record<string, unknown>>;

const malformed = (): IdentityError => new IdentityError("unknown");

const record = (value: unknown): Fields => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformed();
  return value as Fields;
};

const text = (value: unknown): string => {
  if (typeof value !== "string") throw malformed();
  return value;
};

// A token goes back in an Authorization header or a JSON body: only visible ASCII survives both.
const TOKEN = /^[\x21-\x7E]+$/;

/** A token the client can send back as it came; anything else is a malformed answer. */
const tokenText = (value: unknown): string => {
  if (typeof value !== "string" || !TOKEN.test(value)) throw malformed();
  return value;
};

const nonEmptyText = (value: unknown): string => {
  const result = text(value);
  if (result === "") throw malformed();
  return result;
};

const flag = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw malformed();
  return value;
};

const nullableText = (value: unknown): string | null =>
  value === undefined || value === null ? null : text(value);

/** Copies the optional text fields that are present, refusing ones of another type. */
const optionalTexts = <K extends string>(
  fields: Fields,
  keys: readonly K[],
): Partial<Record<K, string>> => {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = fields[key];
    if (value !== undefined && value !== null) result[key] = text(value);
  }
  return result;
};

export const readUser = (value: unknown): IdentityUser => {
  const fields = record(value);
  const id = fields.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id)) throw malformed();
  return Object.freeze({
    id,
    ...optionalTexts(fields, ["documentId"]),
    username: text(fields.username),
    email: text(fields.email),
    provider: fields.provider === undefined ? "local" : text(fields.provider),
    confirmed: flag(fields.confirmed, false),
    blocked: flag(fields.blocked, false),
    ...optionalTexts(fields, ["createdAt", "updatedAt"]),
  });
};

export interface AuthResponse {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly user?: IdentityUser;
  /** The access token's lifetime in seconds, when a backend reports it. */
  readonly expiresIn?: number;
  /** When the access token expires, when a backend reports it. */
  readonly expiresAt?: string | number;
}

/** A sign-in, registration or refresh answer: a token, a user, or both. */
export const readAuthResponse = (value: unknown): AuthResponse => {
  const fields = record(value);
  const result: {
    accessToken?: string;
    refreshToken?: string;
    user?: IdentityUser;
    expiresIn?: number;
    expiresAt?: string | number;
  } = {};
  if (fields.jwt !== undefined) result.accessToken = tokenText(fields.jwt);
  if (fields.refreshToken !== undefined) result.refreshToken = tokenText(fields.refreshToken);
  if (fields.user !== undefined) result.user = readUser(fields.user);
  // Hints only: an unreadable one is ignored rather than failing the sign-in.
  if (typeof fields.expiresIn === "number") result.expiresIn = fields.expiresIn;
  if (typeof fields.expiresAt === "string" || typeof fields.expiresAt === "number") {
    result.expiresAt = fields.expiresAt;
  }
  if (result.accessToken === undefined && result.user === undefined) throw malformed();
  return result;
};

export interface ErrorEnvelope {
  readonly status: number;
  readonly name: string;
  readonly message: string;
  /** The top-level input fields a validation error names. */
  readonly fields: readonly string[];
}

const fieldNames = (details: unknown): string[] => {
  if (typeof details !== "object" || details === null) return [];
  const errors = (details as Fields).errors;
  if (!Array.isArray(errors)) return [];
  const names = errors.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const path = (entry as Fields).path;
    const first: unknown = Array.isArray(path) ? path[0] : undefined;
    return typeof first === "string" ? [first] : [];
  });
  return [...new Set(names)];
};

/** The `{ data: null, error: { status, name, message, details } }` body, if that is what it is. */
export const readErrorEnvelope = (value: unknown): ErrorEnvelope | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const error = (value as Fields).error;
  if (typeof error !== "object" || error === null) return undefined;
  const { status, name, message, details } = error as Fields;
  if (typeof status !== "number" || typeof name !== "string" || typeof message !== "string") {
    return undefined;
  }
  return { status, name, message, fields: fieldNames(details) };
};

const readSession = (value: unknown): IdentitySession => {
  const fields = record(value);
  if (typeof fields.current !== "boolean") throw malformed();
  return Object.freeze({
    id: nonEmptyText(fields.id),
    ...optionalTexts(fields, ["deviceId", "deviceName"]),
    current: fields.current,
    ...optionalTexts(fields, ["loginAt"]),
    lastActiveAt: text(fields.lastActiveAt),
  });
};

const list = (value: unknown): readonly unknown[] => {
  const data = record(value).data;
  if (!Array.isArray(data)) throw malformed();
  return data;
};

export const readSessions = (value: unknown): readonly IdentitySession[] =>
  Object.freeze(list(value).map(readSession));

const readProfileEntry = (value: unknown): Profile => {
  const fields = record(value);
  return Object.freeze({
    documentId: nonEmptyText(fields.documentId),
    displayName: text(fields.displayName),
    bio: nullableText(fields.bio),
    locale: nullableText(fields.locale),
    timezone: nullableText(fields.timezone),
    marketingOptIn: flag(fields.marketingOptIn, false),
  });
};

/** `{ data: profile }`, as a create, update or read answers. */
export const readProfile = (value: unknown): Profile => readProfileEntry(record(value).data);

/** `{ data: [profile], meta }`: the owner's profile, or null when there is none yet. */
export const readProfileList = (value: unknown): Profile | null => {
  const first = list(value)[0];
  return first === undefined ? null : readProfileEntry(first);
};
