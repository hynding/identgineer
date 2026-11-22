import { describe, expect, it } from "vitest";
import { rejection, setup } from "./test-harness.ts";

describe("getProfile", () => {
  it("is null before the owner has a profile", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    expect(await client.getProfile()).toBeNull();
    const request = api.requests.at(-1);
    expect(request?.path).toBe("/api/profiles");
    expect(request?.method).toBe("GET");
    expect(request?.credentials).toBe("omit");
  });

  it("needs a session", async () => {
    const { client } = setup();
    await expect(client.getProfile()).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("saveProfile", () => {
  it("creates the profile, then updates it", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const created = await client.saveProfile({ displayName: "Ada", timezone: "Europe/London" });
    expect(created).toEqual({
      documentId: expect.any(String) as unknown,
      displayName: "Ada",
      bio: null,
      locale: "en",
      timezone: "Europe/London",
      marketingOptIn: false,
    });
    expect(api.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/api/profiles",
      body: { data: { displayName: "Ada", timezone: "Europe/London" } },
    });
    const updated = await client.saveProfile({ displayName: "Ada L.", marketingOptIn: true });
    expect(updated).toMatchObject({
      displayName: "Ada L.",
      marketingOptIn: true,
      timezone: "Europe/London",
    });
    expect(api.requests.at(-1)).toMatchObject({
      method: "PUT",
      path: `/api/profiles/${created.documentId}`,
    });
    expect(await client.getProfile()).toEqual(updated);
  });

  it("sends only the profile's own fields", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    const input = { displayName: "Ada", owner: 99, id: 1, __proto__: { admin: true } };
    await client.saveProfile(input);
    expect(api.requests.at(-1)?.body).toEqual({ data: { displayName: "Ada" } });
  });

  it.each([
    [{ displayName: "" }, ["displayName"]],
    [{ displayName: "x".repeat(81) }, ["displayName"]],
    [{ displayName: "Ada", bio: "x".repeat(501) }, ["bio"]],
    [{ displayName: "Ada", locale: "english" }, ["locale"]],
    [{ displayName: "Ada", timezone: "Europe/../x" }, ["timezone"]],
    [{ displayName: "Ada", locale: "EN", timezone: "a b" }, ["locale", "timezone"]],
  ])("refuses %j locally and names %j", async (input, fields) => {
    const { api, client, signIn } = setup();
    await signIn();
    const sent = api.requests.length;
    expect(await rejection(client.saveProfile(input))).toMatchObject({
      code: "validation",
      fields,
    });
    expect(api.requests).toHaveLength(sent);
  });

  it("passes on the field names of a server-side validation error", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.respondNext("GET", "/api/profiles", { status: 200, body: { data: [], meta: {} } });
    api.respondNext("POST", "/api/profiles", {
      status: 400,
      body: {
        data: null,
        error: {
          status: 400,
          name: "ValidationError",
          message: "x",
          details: { errors: [{ path: ["bio"] }, { path: ["password"] }] },
        },
      },
    });
    await expect(client.saveProfile({ displayName: "Ada" })).rejects.toMatchObject({
      code: "validation",
      fields: ["bio"],
    });
  });

  it("maps a forbidden write to unauthorized", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.respondNext("GET", "/api/profiles", { status: 403, body: {} });
    await expect(client.saveProfile({ displayName: "Ada" })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});
