import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD, rejection, settle, setup } from "./test-harness.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });

// Every way page script can persist or print a value it holds.
const FORBIDDEN = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/i,
  /\bIDB[A-Z]\w*/,
  /\bdocument\s*\.\s*cookie\b/,
  /\bcookieStore\b/,
  /\bcaches\b/,
  /\bconsole\s*\./,
];

describe("source rule: no persistent storage and no logging", () => {
  const files = sourceFiles(SOURCE);

  it("finds the package source", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(SOURCE, file), file]))(
    "%s references no storage API or console",
    (_name, file) => {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
    },
  );
});

/** A Storage that records every write, so a write that is later undone still shows. */
const recordingStorage = () => {
  const items = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    storage: {
      get length() {
        return items.size;
      },
      key: (index: number) => [...items.keys()][index] ?? null,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(`${key}=${value}`);
        items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
      clear: () => {
        items.clear();
      },
    },
  };
};

const stubBrowserStorage = () => {
  const local = recordingStorage();
  const session = recordingStorage();
  const cookieWrites: string[] = [];
  const document = {
    get cookie() {
      return "";
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  };
  const indexedDbOpen = vi.fn();
  const cachesOpen = vi.fn();
  const cookieStoreSet = vi.fn();
  vi.stubGlobal("localStorage", local.storage);
  vi.stubGlobal("sessionStorage", session.storage);
  vi.stubGlobal("document", document);
  vi.stubGlobal("indexedDB", { open: indexedDbOpen });
  vi.stubGlobal("caches", { open: cachesOpen });
  vi.stubGlobal("cookieStore", { set: cookieStoreSet });
  return { local, session, cookieWrites, indexedDbOpen, cachesOpen, cookieStoreSet };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const bearerTokens = (requests: readonly { headers: Headers }[]): string[] =>
  requests.flatMap((request) => {
    const value = request.headers.get("authorization");
    return value === null ? [] : [value.slice("Bearer ".length)];
  });

describe("acceptance: no token readable from persistent browser storage", () => {
  it("leaves every storage API untouched through a whole session", async () => {
    const browser = stubBrowserStorage();
    const { api, clock, client, makeClient, signIn } = setup({ accessTokenLifetimeSeconds: 600 });
    await signIn();
    await client.currentUser();
    clock.advance(570_000);
    await settle();
    await makeClient().restore();
    await client.changePassword({
      currentPassword: PASSWORD,
      password: "a different password",
      passwordConfirmation: "a different password",
    });
    await client.saveProfile({ displayName: "Ada" });
    await client.signOut();

    expect(bearerTokens(api.requests).length).toBeGreaterThan(3);
    expect(browser.local.writes).toEqual([]);
    expect(browser.session.writes).toEqual([]);
    expect(browser.local.storage.length).toBe(0);
    expect(browser.session.storage.length).toBe(0);
    expect(browser.cookieWrites).toEqual([]);
    expect(browser.indexedDbOpen).not.toHaveBeenCalled();
    expect(browser.cachesOpen).not.toHaveBeenCalled();
    expect(browser.cookieStoreSet).not.toHaveBeenCalled();
  });

  it("keeps tokens off the client, its state and its errors", async () => {
    const { api, client, signIn } = setup();
    await signIn();
    api.respondNext("GET", "/api/users/me", { status: 500 });
    const error = await rejection(client.currentUser());
    const tokens = bearerTokens(api.requests);
    expect(tokens.length).toBeGreaterThan(0);
    const exposed = [
      JSON.stringify(client),
      JSON.stringify(client.getState()),
      Object.getOwnPropertyNames(client).join(),
      JSON.stringify(error),
      String(error),
      (error as Error).stack ?? "",
    ].join("\n");
    for (const token of tokens) expect(exposed).not.toContain(token);
  });
});
