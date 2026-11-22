import { describe, expect, it } from "vitest";
import {
  readAuthResponse,
  readErrorEnvelope,
  readProfile,
  readProfileList,
  readSessions,
  readUser,
} from "./shapes.ts";

const USER = {
  id: 7,
  documentId: "abc123",
  username: "ada",
  email: "ada@example.com",
  provider: "local",
  confirmed: true,
  blocked: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
};

const expectMalformed = (read: () => unknown): void => {
  expect(read).toThrow(expect.objectContaining({ code: "unknown" }));
};

describe("readUser", () => {
  it("keeps the known fields and freezes the result", () => {
    const user = readUser({ ...USER, password: "hash", role: { id: 1 } });
    expect(user).toEqual({
      id: 7,
      documentId: "abc123",
      username: "ada",
      email: "ada@example.com",
      provider: "local",
      confirmed: true,
      blocked: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(Object.isFrozen(user)).toBe(true);
  });

  it("fills the flags a minimal user leaves out", () => {
    expect(readUser({ id: 1, username: "a", email: "a@b.c" })).toEqual({
      id: 1,
      username: "a",
      email: "a@b.c",
      provider: "local",
      confirmed: false,
      blocked: false,
    });
  });

  it.each([
    null,
    "user",
    [],
    { ...USER, id: "7" },
    { ...USER, id: 1.5 },
    { ...USER, username: 3 },
    { ...USER, email: null },
    { ...USER, confirmed: "yes" },
  ])("refuses %j", (value) => {
    expectMalformed(() => readUser(value));
  });
});

describe("readAuthResponse", () => {
  it("reads a token with a user", () => {
    const auth = readAuthResponse({ jwt: "a.b.c", refreshToken: "s.t", user: USER });
    expect(auth.accessToken).toBe("a.b.c");
    expect(auth.refreshToken).toBe("s.t");
    expect(auth.user?.id).toBe(7);
  });

  it("reads a refresh answer, which has no user", () => {
    const auth = readAuthResponse({ jwt: "a.b.c" });
    expect(auth).toEqual({ accessToken: "a.b.c" });
  });

  it("reads a confirmation-pending registration, which has no token", () => {
    expect(readAuthResponse({ user: USER }).accessToken).toBeUndefined();
  });

  it.each([
    { jwt: "" },
    { jwt: 1 },
    { jwt: "x", refreshToken: 2 },
    { jwt: "x", user: "u" },
    {},
    { jwt: "abc\ndef" },
    { jwt: "a b" },
    { jwt: "a.b\u00e9" },
    { jwt: "x", refreshToken: "s\tt" },
  ])("refuses %j", (value) => {
    expectMalformed(() => readAuthResponse(value));
  });
});

describe("readErrorEnvelope", () => {
  it("reads the Strapi error envelope and its field paths", () => {
    expect(
      readErrorEnvelope({
        data: null,
        error: {
          status: 400,
          name: "ValidationError",
          message: "2 errors occurred",
          details: {
            errors: [
              { path: ["email"], message: "email must be a valid email", name: "ValidationError" },
              { path: ["username"], message: "username is a required field" },
              { path: [3], message: "odd" },
            ],
          },
        },
      }),
    ).toEqual({
      status: 400,
      name: "ValidationError",
      message: "2 errors occurred",
      fields: ["email", "username"],
    });
  });

  it("returns undefined for anything else", () => {
    expect(readErrorEnvelope(undefined)).toBeUndefined();
    expect(readErrorEnvelope({ error: "nope" })).toBeUndefined();
    expect(
      readErrorEnvelope({ error: { status: "400", name: "x", message: "y" } }),
    ).toBeUndefined();
  });
});

describe("readSessions", () => {
  it("reads the session list", () => {
    expect(
      readSessions({
        data: [
          {
            id: "s1",
            deviceId: "d1",
            deviceName: "Firefox on Linux",
            current: true,
            loginAt: "2026-01-01T00:00:00.000Z",
            lastActiveAt: "2026-01-02T00:00:00.000Z",
          },
          { id: "s2", current: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    ).toEqual([
      {
        id: "s1",
        deviceId: "d1",
        deviceName: "Firefox on Linux",
        current: true,
        loginAt: "2026-01-01T00:00:00.000Z",
        lastActiveAt: "2026-01-02T00:00:00.000Z",
      },
      { id: "s2", current: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it.each([{}, { data: {} }, { data: [{ id: 1, current: true }] }, { data: [{ id: "x" }] }])(
    "refuses %j",
    (value) => {
      expectMalformed(() => readSessions(value));
    },
  );
});

describe("readProfile", () => {
  const PROFILE = {
    id: 3,
    documentId: "p1",
    displayName: "Ada",
    bio: null,
    locale: "en",
    timezone: "UTC",
    marketingOptIn: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("reads one profile from a data envelope", () => {
    expect(readProfile({ data: PROFILE })).toEqual({
      documentId: "p1",
      displayName: "Ada",
      bio: null,
      locale: "en",
      timezone: "UTC",
      marketingOptIn: false,
    });
  });

  it("reads the first of a list, or null for none", () => {
    expect(readProfileList({ data: [PROFILE], meta: {} })?.documentId).toBe("p1");
    expect(readProfileList({ data: [], meta: {} })).toBeNull();
  });

  it.each([
    { data: null },
    { data: { ...PROFILE, documentId: 3 } },
    { data: { ...PROFILE, displayName: 1 } },
  ])("refuses %j", (value) => {
    expectMalformed(() => readProfile(value));
  });
});
