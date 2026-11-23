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
import "../button/button";
import "../field/field";
import "../input/input";
import "./sign-in";

const navigation = vi.hoisted(() => ({ assigned: [] as string[] }));

vi.mock("../../identity/navigation", () => ({
  assignLocation: (url: string) => {
    navigation.assigned.push(url);
  },
}));

interface SignInElement extends HTMLElement {
  client?: unknown;
  clock?: unknown;
  labels?: Record<string, string>;
  providers?: { name: string; label: string }[];
  providerCallback?: string;
}

const EVENTS = ["idgSignedIn", "idgProviderSignIn", "idgInput", "idgChange"];

async function mount(client?: IdentityClient) {
  const rendered = await render(<idg-sign-in />);
  const root = rendered.root as SignInElement;
  if (client) root.client = client;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  navigation.assigned = [];
  events = recordEvents(EVENTS);
});

afterEach(() => {
  events.stop();
});

describe("idg-sign-in form", () => {
  it("is a real form with the identifier and password a password manager or passkey looks for", async () => {
    const { client } = identitySetup();
    const { root } = await mount(client);
    expect(shadowOf(root).querySelector("form")?.hasAttribute("novalidate")).toBe(true);
    const identifier = nativeInput(root, "identifier");
    expect(identifier.getAttribute("type")).toBe("text");
    expect(identifier.getAttribute("autocomplete")).toBe("username webauthn");
    expect(identifier.getAttribute("autocapitalize")).toBe("none");
    expect(identifier.getAttribute("spellcheck")).toBe("false");
    expect(identifier.getAttribute("inputmode")).toBe("email");
    const password = nativeInput(root, "password");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(password.getAttribute("autocapitalize")).toBe("none");
    expect(password.getAttribute("spellcheck")).toBe("false");
  });

  it("labels the fields and has a show password toggle with a name", async () => {
    const { root } = await mount();
    expect(fieldOf(root, "identifier").label).toBe("Email or username");
    expect(fieldOf(root, "password").label).toBe("Password");
    const toggle = control(root, "password").shadowRoot?.querySelector("button.reveal");
    expect(toggle?.getAttribute("aria-label")).toBe("Show password");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
  });

  it("has a submit button that is never disabled as validation", async () => {
    const { root } = await mount();
    const submitButton = button(root, "idg-button.submit");
    expect(submitButton.textContent).toContain("Sign in");
    expect(submitButton.hasAttribute("disabled")).toBe(false);
  });

  it("offers slots for the links to register and to reset a password", async () => {
    const { root } = await mount();
    expect(shadowOf(root).querySelector('slot[name="register"]')).not.toBeNull();
    expect(shadowOf(root).querySelector('slot[name="reset"]')).not.toBeNull();
  });

  it("keeps the inner controls' events, which carry the typed values, inside", async () => {
    const { root } = await mount();
    nativeInput(root, "password").value = PASSWORD;
    nativeInput(root, "password").dispatchEvent(new Event("input", { bubbles: true }));
    nativeInput(root, "password").dispatchEvent(new Event("change", { bubbles: true }));
    expect(events.seen).toEqual([]);
  });
});

describe("idg-sign-in signing in", () => {
  it("signs in, then tells the page who without any credential, and clears the password", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    const event = submit(root);
    expect(event.defaultPrevented).toBe(true);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-in");
    const signedIn = events.seen.filter((seen) => seen.type === "idgSignedIn");
    expect(signedIn).toEqual([
      { type: "idgSignedIn", detail: { user: { id: 1, username: "ada" } } },
    ]);
    expect(JSON.stringify(events.seen)).not.toContain(PASSWORD);
    expect(control(root, "password").value).toBe("");
    expect(textOf(root, '[part="error"]')).toBe("");
  });

  it("sends one request for a double submit, and the button is loading meanwhile", async () => {
    const { api, client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    const release = api.holdNext("POST", "/api/auth/local");
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    submit(root);
    await waitForChanges();
    expect(button(root, "idg-button.submit").loading).toBe(true);
    release();
    await settle(waitForChanges);
    expect(api.requests.filter((request) => request.path === "/api/auth/local")).toHaveLength(1);
    expect(button(root, "idg-button.submit").loading).toBe(false);
  });

  it("checks for empty fields itself: marks each, focuses the first and sends nothing", async () => {
    const { api, client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    const focus = vi.spyOn(
      control(root, "identifier") as { setFocus: () => Promise<void> },
      "setFocus",
    );
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "identifier").error).toBe("Enter your email or username.");
    expect(fieldOf(root, "password").error).toBe("Enter your password.");
    expect(textOf(root, '[part="error"]')).toBe(
      "Some details are missing or not valid. Check the marked fields.",
    );
    expect(shadowOf(root).querySelector('idg-alert[part="error"]')?.getAttribute("variant")).toBe(
      "danger",
    );
    expect(focus).toHaveBeenCalled();
    expect(api.requests).toHaveLength(0);
  });

  it("shows one message for a wrong password and an unknown account, the same to the letter", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    fill(root, { identifier: "ada@example.com", password: "wrong password" });
    submit(root);
    await settle(waitForChanges);
    const wrongPassword = shadowOf(root).querySelector('[part="error"]')?.outerHTML;
    fill(root, { identifier: "nobody@example.com", password: "wrong password" });
    submit(root);
    await settle(waitForChanges);
    const unknownAccount = shadowOf(root).querySelector('[part="error"]')?.outerHTML;
    expect(textOf(root, '[part="error"]')).toBe("The email, username or password is not correct.");
    expect(wrongPassword).toBe(unknownAccount);
    expect(control(root, "password").value).toBe("");
    expect(button(root, "idg-button.submit").loading).toBe(false);
  });

  it("never shows the server's own words", async () => {
    const { api, client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    api.respondNext("POST", "/api/auth/local", {
      status: 500,
      body: { data: null, error: { status: 500, name: "X", message: "ada exists" } },
    });
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="error"]')).toBe("Something went wrong. Try again later.");
    expect(shadowOf(root).textContent).not.toContain("ada exists");
  });

  it("says a network failure can be retried, keeps the password, and retries", async () => {
    const { api, client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    api.respondNext("POST", "/api/auth/local", "network-error");
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="error"]')).toContain(
      "The service could not be reached. Check your connection and try again.",
    );
    expect(control(root, "password").value).toBe(PASSWORD);
    const retry = button(root, '[part="error"] idg-button');
    expect(retry.textContent).toBe("Try again");
    retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-in");
  });

  it("asks to confirm the address when the backend says so", async () => {
    const { api, client } = identitySetup({ emailConfirmation: true });
    api.addUser({ username: "bo", email: "bo@example.com", password: PASSWORD, confirmed: false });
    const { root, waitForChanges } = await mount(client);
    fill(root, { identifier: "bo@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="error"]')).toBe(
      "Confirm your email address before signing in. Check your inbox for the link.",
    );
  });
});

describe("idg-sign-in throttling", () => {
  it("counts down from the client's wait, announces it politely once, and says when it is over", async () => {
    const { api, client, clock } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.clock = clock;
    api.respondNext("POST", "/api/auth/local", throttledAnswer(65));
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    const notice = shadowOf(root).querySelector('[part="throttle"]');
    expect(notice?.hasAttribute("quiet")).toBe(true);
    expect(textOf(root, '[part="throttle"]')).toBe("Too many attempts. You can try again in 1:05.");
    expect(textOf(root, '[role="status"]')).toBe("Too many attempts. You can try again in 1:05.");
    expect(textOf(root, '[part="error"]')).toBe("");
    clock.advance(1000);
    await waitForChanges();
    expect(textOf(root, '[part="throttle"]')).toBe("Too many attempts. You can try again in 1:04.");
    expect(textOf(root, '[role="status"]')).toBe("Too many attempts. You can try again in 1:05.");
    expect(button(root, "idg-button.submit").hasAttribute("disabled")).toBe(false);
    clock.advance(64_000);
    await waitForChanges();
    expect(shadowOf(root).querySelector('[part="throttle"]')).toBeNull();
    expect(textOf(root, '[role="status"]')).toBe("You can try again now.");
  });

  it("stops counting once disconnected", async () => {
    const { api, client, clock } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.clock = clock;
    api.respondNext("POST", "/api/auth/local", throttledAnswer(30));
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    const before = clock.pendingTimers();
    removeHost(root);
    expect(clock.pendingTimers()).toBe(before - 1);
  });
});

describe("idg-sign-in client", () => {
  it("says something went wrong when submitted without a client, and works once one is set", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount();
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="error"]')).toBe("Something went wrong. Try again later.");
    root.client = client;
    fill(root, { password: PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-in");
    expect(textOf(root, '[part="error"]')).toBe("");
  });

  it("drops the answer of a client swapped out while it was signing in, and is not left pending", async () => {
    const first = identitySetup();
    const second = identitySetup();
    const { root, waitForChanges } = await mount(first.client);
    const release = first.api.holdNext("POST", "/api/auth/local");
    fill(root, { identifier: "ada@example.com", password: PASSWORD });
    submit(root);
    await waitForChanges();
    root.client = second.client;
    await waitForChanges();
    expect(button(root, "idg-button.submit").loading).toBe(false);
    release();
    await settle(waitForChanges);
    expect(events.seen.filter((seen) => seen.type === "idgSignedIn")).toEqual([]);
  });

  it("clears the password when it is disconnected", async () => {
    const { root } = await mount();
    const password = control(root, "password");
    password.value = PASSWORD;
    removeHost(root);
    expect(password.value).toBe("");
  });
});

describe("idg-sign-in providers", () => {
  it("draws a button for each provider, and goes to the URL the client builds", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.providers = [{ name: "github", label: "GitHub" }];
    root.providerCallback = "https://app.example.test/auth/github";
    await waitForChanges();
    const provider = button(root, '[part="providers"] idg-button');
    expect(provider.textContent).toBe("Continue with GitHub");
    provider.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const expected = client.providerSignInUrl("github", {
      callback: "https://app.example.test/auth/github",
    });
    expect(events.seen.filter((seen) => seen.type === "idgProviderSignIn")).toEqual([
      { type: "idgProviderSignIn", detail: { provider: "github", url: expected } },
    ]);
    expect(navigation.assigned).toEqual([expected]);
  });

  it("leaves the navigation to the page when it cancels the event", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.providers = [{ name: "github", label: "GitHub" }];
    await waitForChanges();
    root.addEventListener("idgProviderSignIn", (event) => {
      event.preventDefault();
    });
    button(root, '[part="providers"] idg-button').dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(navigation.assigned).toEqual([]);
  });

  it("says something went wrong for a provider the client refuses", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    root.providers = [{ name: "not a provider!", label: "Bad" }];
    await waitForChanges();
    button(root, '[part="providers"] idg-button').dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await waitForChanges();
    expect(navigation.assigned).toEqual([]);
    expect(textOf(root, '[part="error"]')).toBe("Something went wrong. Try again later.");
  });

  it("draws no provider section without providers", async () => {
    const { root } = await mount();
    expect(shadowOf(root).querySelector('[part="providers"]')).toBeNull();
  });
});

describe("idg-sign-in labels", () => {
  it("uses the labels it is given and keeps the English defaults of the rest", async () => {
    const { root, waitForChanges } = await mount();
    root.labels = { submit: "Anmelden", identifierRequired: "Bitte ausfüllen." };
    await waitForChanges();
    expect(button(root, "idg-button.submit").textContent).toContain("Anmelden");
    expect(fieldOf(root, "password").label).toBe("Password");
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "identifier").error).toBe("Bitte ausfüllen.");
  });
});
