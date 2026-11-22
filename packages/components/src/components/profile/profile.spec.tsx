import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render } from "../../testing/form-internals";
import {
  button,
  control,
  fieldOf,
  fill,
  nativeInput,
  recordEvents,
  shadowOf,
  submit,
  textOf,
} from "../../testing/identity-form";
import { identitySetup, PASSWORD, settle } from "../../testing/identity-harness";
import { removeHost } from "../../testing/remove-host";
import "../alert/alert";
import "../avatar/avatar";
import "../badge/badge";
import "../button/button";
import "../field/field";
import "../input/input";
import "../select/select";
import "../switch/switch";
import "../textarea/textarea";
import "./profile";

interface ProfileElement extends HTMLElement {
  client?: unknown;
  clock?: unknown;
  labels?: Record<string, string>;
  avatarSrc?: string;
}

interface SwitchElement extends HTMLElement {
  checked: boolean;
}

const EVENTS = [
  "idgProfileSaved",
  "idgPasswordChanged",
  "idgSessionRevoked",
  "idgSignedOut",
  "idgInput",
  "idgChange",
];
const NEW_PASSWORD = "a new and long password";
const DETAILS = 'form[part="details"]';
const PASSWORD_FORM = 'form[part="password"]';

async function mount(client?: unknown) {
  const rendered = await render(<idg-profile />);
  const root = rendered.root as ProfileElement;
  if (client) root.client = client;
  await settle(rendered.waitForChanges);
  return { ...rendered, root };
}

async function signedIn() {
  const setup = identitySetup();
  await setup.signIn();
  return setup;
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  events = recordEvents(EVENTS);
});

afterEach(() => {
  events.stop();
});

describe("idg-profile details", () => {
  it("shows the saved profile in its fields, with the avatar the page gives", async () => {
    const { client } = await signedIn();
    await client.saveProfile({
      displayName: "Ada Lovelace",
      bio: "Analyst",
      locale: "en-GB",
      timezone: "Europe/London",
      marketingOptIn: true,
    });
    const { root, waitForChanges } = await mount(client);
    root.avatarSrc = "/avatars/ada.png";
    await waitForChanges();
    expect(control(root, "displayName").value).toBe("Ada Lovelace");
    expect(control(root, "bio").value).toBe("Analyst");
    expect(control(root, "locale").value).toBe("en-GB");
    expect(control(root, "timezone").value).toBe("Europe/London");
    expect((control(root, "marketingOptIn") as unknown as SwitchElement).checked).toBe(true);
    const avatar = shadowOf(root).querySelector("idg-avatar") as {
      name?: string;
      src?: string;
    } | null;
    expect(avatar?.name).toBe("Ada Lovelace");
    expect(avatar?.src).toBe("/avatars/ada.png");
  });

  it("starts from the username when there is no profile yet, and creates one on save with the CMS's defaults for what is left empty", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    expect(control(root, "displayName").value).toBe("ada");
    fill(root, { bio: "Analyst" });
    submit(root, DETAILS);
    await settle(waitForChanges);
    const saved = await client.getProfile();
    expect(saved).toMatchObject({ displayName: "ada", bio: "Analyst", marketingOptIn: false });
    expect(textOf(root, '[part="details-saved"]')).toBe("Profile saved.");
    expect(events.seen).toEqual([
      {
        type: "idgProfileSaved",
        detail: {
          profile: {
            displayName: "ada",
            bio: "Analyst",
            locale: "en",
            timezone: "UTC",
            marketingOptIn: false,
          },
        },
      },
    ]);
  });

  it("marks an empty display name itself and sends nothing", async () => {
    const { client, api } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    const before = api.requests.length;
    fill(root, { displayName: "  " });
    submit(root, DETAILS);
    await waitForChanges();
    expect(fieldOf(root, "displayName").error).toBe("Enter a display name.");
    expect(api.requests).toHaveLength(before);
  });

  it("marks the fields the client refuses, with fixed words", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    fill(root, { displayName: "x".repeat(81), locale: "not a locale!" });
    submit(root, DETAILS);
    await settle(waitForChanges);
    expect(fieldOf(root, "displayName").error).toBe("Use at most 80 characters.");
    expect(fieldOf(root, "locale").error).toBe("Use a language tag such as en-GB.");
    expect(textOf(root, `${DETAILS} [part="error"]`)).toBe(
      "Some details are missing or not valid. Check the marked fields.",
    );
  });

  it("offers the browser's time zones, and keeps a saved one it does not list", async () => {
    const { client } = await signedIn();
    await client.saveProfile({ displayName: "Ada", timezone: "Etc/GMT-14" });
    const { root } = await mount(client);
    const values = Array.from(
      shadowOf(root).querySelectorAll('[name="timezone"] option'),
      (option) => option.getAttribute("value"),
    );
    expect(values[0]).toBe("");
    expect(values).toContain("Europe/London");
    expect(values).toContain("Etc/GMT-14");
  });

  it("asks the field for a language with the autofill token for it", async () => {
    const { client } = await signedIn();
    const { root } = await mount(client);
    expect(nativeInput(root, "locale").getAttribute("autocomplete")).toBe("language");
    expect(nativeInput(root, "displayName").getAttribute("autocomplete")).toBe("nickname");
  });
});

describe("idg-profile password", () => {
  it("changes the password, says so, and empties the three fields", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    fill(root, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    submit(root, PASSWORD_FORM);
    await settle(waitForChanges);
    expect(textOf(root, '[part="password-saved"]')).toBe(
      "Password changed. Your other sessions were signed out.",
    );
    expect(
      ["currentPassword", "newPassword", "passwordConfirmation"].map(
        (name) => control(root, name).value,
      ),
    ).toEqual(["", "", ""]);
    expect(events.seen.map((event) => event.type)).toEqual(["idgPasswordChanged"]);
    expect(JSON.stringify(events.seen)).not.toContain(NEW_PASSWORD);
    expect(
      await client
        .signOut()
        .then(() => client.signIn({ identifier: "ada", password: NEW_PASSWORD })),
    ).toMatchObject({ username: "ada" });
  });

  it("has the fields a password manager pairs with the account", async () => {
    const { client } = await signedIn();
    const { root } = await mount(client);
    // An idg-input like the password fields, out of sight but laid out: managers skip a field
    // that is display: none, and the companion must be built as the fields it pairs with are.
    const username = shadowOf(root).querySelector<
      HTMLElement & { value?: string; readonly?: boolean; autocomplete?: string }
    >(`${PASSWORD_FORM} .username-companion idg-input[name="username"]`);
    expect(username?.value).toBe("ada");
    expect(username?.readonly).toBe(true);
    expect(username?.autocomplete).toBe("username");
    expect(username?.getAttribute("tabindex")).toBe("-1");
    expect(shadowOf(root).querySelector(`${PASSWORD_FORM} input[hidden]`)).toBeNull();
    expect(nativeInput(root, "currentPassword").getAttribute("autocomplete")).toBe(
      "current-password",
    );
    expect(nativeInput(root, "newPassword").getAttribute("autocomplete")).toBe("new-password");
    expect(nativeInput(root, "passwordConfirmation").getAttribute("autocomplete")).toBe(
      "new-password",
    );
    expect(textOf(root, '[part="byte-count"]')).toBe("0 of 72 bytes used");
  });

  it("says a wrong current password is wrong", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    fill(root, {
      currentPassword: "not the password",
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    submit(root, PASSWORD_FORM);
    await settle(waitForChanges);
    expect(textOf(root, `${PASSWORD_FORM} [part="error"]`)).toBe(
      "The current password is not correct.",
    );
    expect(control(root, "currentPassword").value).toBe("");
    expect(button(root, `${PASSWORD_FORM} idg-button.submit`).loading).toBe(false);
  });

  it("checks the new password before sending: not the current one, within 72 bytes, the same twice", async () => {
    const { client, api } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    const before = api.requests.length;
    fill(root, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
      passwordConfirmation: PASSWORD,
    });
    submit(root, PASSWORD_FORM);
    await waitForChanges();
    expect(fieldOf(root, "newPassword").error).toBe(
      "Choose a password different from the current one.",
    );
    fill(root, { newPassword: "é".repeat(37), passwordConfirmation: "other" });
    submit(root, PASSWORD_FORM);
    await waitForChanges();
    expect(fieldOf(root, "newPassword").error).toContain("too long");
    expect(fieldOf(root, "passwordConfirmation").error).toBe("The passwords do not match.");
    expect(api.requests).toHaveLength(before);
  });
});

describe("idg-profile sessions", () => {
  it("lists the sessions, this one marked, and signs another out", async () => {
    const { client, makeClient } = await signedIn();
    const laptop = makeClient();
    await laptop.signIn({ identifier: "ada", password: PASSWORD });
    const { root, waitForChanges } = await mount(client);
    const rows = () => Array.from(shadowOf(root).querySelectorAll('[part="session"]'));
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.textContent).toContain("This device");
    expect(rows()[0]?.querySelector("idg-button")).toBeNull();
    const revoke = rows()[1]?.querySelector("idg-button");
    expect(revoke?.textContent).toContain("Sign out");
    revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(waitForChanges);
    expect(rows()).toHaveLength(1);
    expect(textOf(root, '[part="sessions"] [role="status"]')).toBe("The session is signed out.");
    expect(events.seen.map((event) => event.type)).toEqual(["idgSessionRevoked"]);
  });

  it("signs out everywhere and tells the page how it went", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    button(root, "idg-button.sign-out-everywhere").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-out");
    expect(events.seen).toEqual([
      { type: "idgSignedOut", detail: { outcome: "signed-out", everywhere: true } },
    ]);
    expect(textOf(root, '[part="signed-out"]')).toBe("Sign in to see your profile.");
  });

  it("ignores a sign-out everywhere that ends after the client was swapped", async () => {
    const { client, makeClient } = await signedIn();
    let finish = (): void => undefined;
    const slow = {
      ...client,
      signOut: () =>
        new Promise<{ outcome: "server-unreachable" }>((resolve) => {
          finish = () => {
            resolve({ outcome: "server-unreachable" });
          };
        }),
    };
    const { root, waitForChanges } = await mount(slow);
    await settle(waitForChanges);
    button(root, "idg-button.sign-out-everywhere").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    root.client = makeClient();
    await waitForChanges();
    finish();
    await settle(waitForChanges);
    expect(events.seen.filter((event) => event.type === "idgSignedOut")).toEqual([]);
    expect(shadowOf(root).querySelector('[part="outcome"]')).toBeNull();
  });

  it("draws its section headings at the level it is given, 2 by default", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    expect(shadowOf(root).querySelectorAll("h2.heading")).toHaveLength(3);
    (root as HTMLElement & { headingLevel?: number }).headingLevel = 4;
    await waitForChanges();
    expect(shadowOf(root).querySelectorAll("h4.heading")).toHaveLength(3);
    (root as HTMLElement & { headingLevel?: number }).headingLevel = 1;
    await waitForChanges();
    expect(shadowOf(root).querySelectorAll("h2.heading")).toHaveLength(3);
  });

  it("says plainly when signing out everywhere could not reach the server", async () => {
    const { client, api } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    api.respondNext("POST", "/api/auth/logout", "network-error");
    button(root, "idg-button.sign-out-everywhere").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await settle(waitForChanges);
    expect(textOf(root, '[part="outcome"]')).toBe(
      "You are signed out on this device, but the server could not be reached. Your sessions may stay active there until they expire.",
    );
  });

  it("says sessions are not available on a backend without them", async () => {
    const { client, signIn } = identitySetup({ sessions: "legacy" });
    await signIn();
    const { root } = await mount(client);
    expect(textOf(root, '[part="sessions"]')).toContain("The list of sessions is not available.");
    expect(shadowOf(root).querySelector('[part="session"]')).toBeNull();
  });
});

describe("idg-profile state", () => {
  it("shows placeholders while the client does not know yet, and a note once signed out", async () => {
    const { client, api } = identitySetup();
    const release = api.holdNext("POST", "/api/auth/refresh");
    const { root, waitForChanges } = await mount(client);
    expect(shadowOf(root).querySelector("idg-skeleton")).not.toBeNull();
    expect(shadowOf(root).querySelector("form")).toBeNull();
    release();
    await settle(waitForChanges);
    expect(textOf(root, '[part="signed-out"]')).toBe("Sign in to see your profile.");
  });

  it("keeps the inner controls' events inside, and clears the passwords when disconnected", async () => {
    const { client } = await signedIn();
    const { root } = await mount(client);
    const input = nativeInput(root, "newPassword");
    input.value = NEW_PASSWORD;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(events.seen).toEqual([]);
    const current = control(root, "currentPassword");
    current.value = PASSWORD;
    removeHost(root);
    expect(current.value).toBe("");
  });

  it("uses the labels it is given", async () => {
    const { client } = await signedIn();
    const { root, waitForChanges } = await mount(client);
    root.labels = { saveProfile: "Speichern" };
    await waitForChanges();
    expect(button(root, `${DETAILS} idg-button.submit`).textContent).toContain("Speichern");
  });
});
