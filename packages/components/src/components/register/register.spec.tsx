import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "@stencil/vitest";
import type { IdentityClient } from "@identgineer/identity";
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
import { identitySetup, PASSWORD, settle, throttledAnswer } from "../../testing/identity-harness";
import { removeHost } from "../../testing/remove-host";
import "../alert/alert";
import "../button/button";
import "../field/field";
import "../input/input";
import "./register";

interface RegisterElement extends HTMLElement {
  client?: unknown;
  clock?: unknown;
  labels?: Record<string, string>;
}

const EVENTS = ["idgRegistered", "idgInput", "idgChange"];
const NEW_PASSWORD = "a new and long password";

async function mount(client?: IdentityClient) {
  const rendered = await render(<idg-register />);
  const root = rendered.root as RegisterElement;
  if (client) root.client = client;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

function typePassword(root: HTMLElement, value: string): void {
  const input = nativeInput(root, "password");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  events = recordEvents(EVENTS);
});

afterEach(() => {
  events.stop();
});

describe("idg-register form", () => {
  it("has the username, email and new password a password manager looks for", async () => {
    const { root } = await mount();
    const username = nativeInput(root, "username");
    expect(username.getAttribute("autocomplete")).toBe("username");
    expect(username.getAttribute("autocapitalize")).toBe("none");
    expect(username.getAttribute("spellcheck")).toBe("false");
    const email = nativeInput(root, "email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.getAttribute("spellcheck")).toBe("false");
    const password = nativeInput(root, "password");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    const toggle = control(root, "password").shadowRoot?.querySelector("button.reveal");
    expect(toggle?.getAttribute("aria-label")).toBe("Show password");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows how many of the 72 bytes the password uses, counting bytes, not characters", async () => {
    const { root, waitForChanges } = await mount();
    expect(textOf(root, '[part="byte-count"]')).toBe("0 of 72 bytes used");
    typePassword(root, "é€😀");
    await waitForChanges();
    expect(textOf(root, '[part="byte-count"]')).toBe("9 of 72 bytes used");
    expect(fieldOf(root, "password").error ?? "").toBe("");
  });

  it("marks a password over 72 bytes as soon as it is, and unmarks it once it fits", async () => {
    const { root, waitForChanges } = await mount();
    typePassword(root, "é".repeat(37));
    await waitForChanges();
    expect(textOf(root, '[part="byte-count"]')).toBe("74 of 72 bytes used");
    expect(fieldOf(root, "password").error).toBe(
      "This password is too long. Use at most 72 bytes: letters with accents and emoji count as more than one.",
    );
    typePassword(root, "é".repeat(36));
    await waitForChanges();
    expect(fieldOf(root, "password").error ?? "").toBe("");
  });

  it("keeps the inner controls' events inside", async () => {
    const { root } = await mount();
    typePassword(root, NEW_PASSWORD);
    expect(events.seen).toEqual([]);
  });
});

describe("idg-register outcomes", () => {
  it("says the same, to the letter, for a new address and one already registered", async () => {
    const { client, api } = identitySetup({ emailConfirmation: true });
    const fresh = await mount(client);
    fill(fresh.root, { username: "grace", email: "grace@example.com", password: NEW_PASSWORD });
    submit(fresh.root);
    await settle(fresh.waitForChanges);
    const taken = await mount(client);
    fill(taken.root, { username: "ada", email: "ada@example.com", password: NEW_PASSWORD });
    submit(taken.root);
    await settle(taken.waitForChanges);
    expect(api.findUser("grace@example.com")).toBeDefined();
    const freshView = shadowOf(fresh.root).innerHTML;
    expect(freshView).toBe(shadowOf(taken.root).innerHTML);
    expect(textOf(fresh.root, '[part="confirmation"]')).toBe(
      "Check your email. If this address can be used, we have sent it a link to finish creating the account.",
    );
    expect(shadowOf(fresh.root).querySelector("form")).toBeNull();
    expect(events.seen).toEqual([
      { type: "idgRegistered", detail: { outcome: "check-email" } },
      { type: "idgRegistered", detail: { outcome: "check-email" } },
    ]);
  });

  it("tells the page who is signed in when the backend confirms no addresses", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    fill(root, { username: "grace", email: "grace@example.com", password: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-in");
    const detail = events.seen[0]?.detail as { outcome: string; user: { username: string } };
    expect(detail.outcome).toBe("signed-in");
    expect(detail.user).toEqual({ id: expect.any(Number) as number, username: "grace" });
    expect(textOf(root, '[part="confirmation"]')).toBe("Your account is ready. You are signed in.");
    expect(JSON.stringify(events.seen)).not.toContain(NEW_PASSWORD);
  });

  it("moves focus to the confirmation, since the form it replaces had it", async () => {
    const { client } = identitySetup({ emailConfirmation: true });
    const { root, waitForChanges } = await mount(client);
    fill(root, { username: "grace", email: "grace@example.com", password: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    const confirmation = shadowOf(root).querySelector<HTMLElement>('[part="confirmation"]');
    expect(confirmation?.getAttribute("tabindex")).toBe("-1");
    expect(shadowOf(root).activeElement).toBe(confirmation);
  });
});

describe("idg-register checks", () => {
  it("marks the empty fields, focuses the first and sends nothing", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    const focus = vi.spyOn(control(root, "username"), "setFocus");
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "username").error).toBe("Choose a username.");
    expect(fieldOf(root, "email").error).toBe("Enter your email address.");
    expect(fieldOf(root, "password").error).toBe("Choose a password.");
    expect(textOf(root, '[part="error"]')).toBe(
      "Some details are missing or not valid. Check the marked fields.",
    );
    expect(focus).toHaveBeenCalled();
    expect(api.requests).toHaveLength(0);
  });

  it("sends nothing for a password over 72 bytes", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    fill(root, { username: "grace", email: "grace@example.com", password: "😀".repeat(19) });
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "password").error).toContain("too long");
    expect(api.requests).toHaveLength(0);
  });

  it("marks the fields the service names, with fixed words, and focuses the first", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    api.respondNext("POST", "/api/auth/local/register", {
      status: 400,
      body: {
        data: null,
        error: {
          status: 400,
          name: "ValidationError",
          message: "email must be a valid email",
          details: {
            errors: [{ path: ["email"], message: "email must be valid", name: "ValidationError" }],
          },
        },
      },
    });
    const focus = vi.spyOn(control(root, "email"), "setFocus");
    fill(root, { username: "grace", email: "grace@example.com", password: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(fieldOf(root, "email").error).toBe("Enter a valid email address.");
    expect(fieldOf(root, "username").error ?? "").toBe("");
    expect(shadowOf(root).textContent).not.toContain("must be");
    expect(focus).toHaveBeenCalled();
    expect(control(root, "password").value).toBe("");
    expect(button(root, "idg-button.submit").loading).toBe(false);
  });

  it("counts a throttled attempt down", async () => {
    const { client, api, clock } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.clock = clock;
    api.respondNext("POST", "/api/auth/local/register", throttledAnswer(10));
    fill(root, { username: "grace", email: "grace@example.com", password: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="throttle"]')).toBe("Too many attempts. You can try again in 0:10.");
  });

  it("clears the password when it is disconnected", async () => {
    const { root } = await mount();
    const password = control(root, "password");
    password.value = PASSWORD;
    removeHost(root);
    expect(password.value).toBe("");
  });

  it("uses the labels it is given", async () => {
    const { root, waitForChanges } = await mount();
    root.labels = { submit: "Konto erstellen", passwordBytes: "{used}/{max}" };
    await waitForChanges();
    expect(button(root, "idg-button.submit").textContent).toContain("Konto erstellen");
    expect(textOf(root, '[part="byte-count"]')).toBe("0/72");
  });
});
