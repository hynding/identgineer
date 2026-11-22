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
import "./password-reset";

interface ResetElement extends HTMLElement {
  client?: unknown;
  clock?: unknown;
  code?: string;
  mode?: string;
  labels?: Record<string, string>;
}

const EVENTS = ["idgResetRequested", "idgPasswordReset", "idgInput", "idgChange"];
const NEW_PASSWORD = "a new and long password";

async function mount(mode: "request" | "complete", client?: IdentityClient, code?: string) {
  const rendered = await render(<idg-password-reset mode={mode} code={code} />);
  const root = rendered.root as ResetElement;
  if (client) root.client = client;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

/** The code the fake mailed for the address's last reset request. */
async function mailedCode(client: IdentityClient, api: ReturnType<typeof identitySetup>["api"]) {
  await client.requestPasswordReset({ email: "ada@example.com" });
  const code = api.findUser("ada@example.com")?.resetCode;
  if (code === undefined) throw new Error("the fake issued no reset code");
  return code;
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  events = recordEvents(EVENTS);
});

afterEach(() => {
  events.stop();
});

describe("idg-password-reset request", () => {
  it("asks for the address with the attributes autofill looks for", async () => {
    const { root } = await mount("request");
    const email = nativeInput(root, "email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.getAttribute("autocapitalize")).toBe("none");
    expect(email.getAttribute("spellcheck")).toBe("false");
    expect(shadowOf(root).querySelector('[name="password"]')).toBeNull();
  });

  it("confirms the same, to the letter, for an address with an account and one without", async () => {
    const { client, api } = identitySetup();
    const known = await mount("request", client);
    fill(known.root, { email: "ada@example.com" });
    submit(known.root);
    await settle(known.waitForChanges);
    const unknown = await mount("request", client);
    fill(unknown.root, { email: "nobody@example.com" });
    submit(unknown.root);
    await settle(unknown.waitForChanges);
    expect(
      api.requests.filter((request) => request.path === "/api/auth/forgot-password"),
    ).toHaveLength(2);
    expect(shadowOf(known.root).innerHTML).toBe(shadowOf(unknown.root).innerHTML);
    expect(textOf(known.root, '[part="confirmation"]')).toBe(
      "If an account uses this address, we have sent it a link to reset the password. Check your email.",
    );
    // No detail at all: the mock DOM leaves it undefined where a browser has null.
    expect(events.seen.map(({ type, detail }) => [type, detail ?? null])).toEqual([
      ["idgResetRequested", null],
      ["idgResetRequested", null],
    ]);
  });

  it("marks an empty or refused address on its field", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount("request", client);
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "email").error).toBe("Enter your email address.");
    fill(root, { email: "not an address" });
    submit(root);
    await settle(waitForChanges);
    expect(fieldOf(root, "email").error).toBe("Enter a valid email address.");
    expect(api.requests).toHaveLength(0);
  });

  it("counts a throttled request down", async () => {
    const { client, api, clock } = identitySetup();
    const { root, waitForChanges } = await mount("request", client);
    root.clock = clock;
    api.respondNext("POST", "/api/auth/forgot-password", throttledAnswer(60));
    fill(root, { email: "ada@example.com" });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="throttle"]')).toBe("Too many attempts. You can try again in 1:00.");
  });
});

describe("idg-password-reset complete", () => {
  it("takes the code from its prop and asks for the new password twice", async () => {
    const { root } = await mount("complete", undefined, "abc");
    expect(shadowOf(root).querySelector('[name="code"]')).toBeNull();
    for (const name of ["password", "passwordConfirmation"]) {
      const input = nativeInput(root, name);
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("autocomplete")).toBe("new-password");
      expect(control(root, name).shadowRoot?.querySelector("button.reveal")).not.toBeNull();
    }
    expect(textOf(root, '[part="byte-count"]')).toBe("0 of 72 bytes used");
  });

  it("asks for the code as a one-time code when the page has none", async () => {
    const { root } = await mount("complete");
    const code = nativeInput(root, "code");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("autocapitalize")).toBe("none");
    expect(code.getAttribute("spellcheck")).toBe("false");
  });

  it("sets the new password, signs in and tells the page who, without the password", async () => {
    const { client, api } = identitySetup();
    const code = await mailedCode(client, api);
    const { root, waitForChanges } = await mount("complete", client, code);
    fill(root, { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-in");
    expect(events.seen).toEqual([
      { type: "idgPasswordReset", detail: { user: { id: 1, username: "ada" } } },
    ]);
    expect(textOf(root, '[part="confirmation"]')).toBe(
      "Your password is changed and you are signed in.",
    );
    expect(JSON.stringify(events.seen)).not.toContain(NEW_PASSWORD);
  });

  it("checks that the two passwords match and fit 72 bytes before sending", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount("complete", client, "code");
    const focus = vi.spyOn(control(root, "password"), "setFocus");
    fill(root, { password: "é".repeat(37), passwordConfirmation: "other" });
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "password").error).toContain("too long");
    expect(fieldOf(root, "passwordConfirmation").error).toBe("The passwords do not match.");
    expect(focus).toHaveBeenCalled();
    expect(api.requests).toHaveLength(0);
  });

  it("says a wrong or used code is not valid, and empties both passwords", async () => {
    const { client } = identitySetup();
    const { root, waitForChanges } = await mount("complete", client, "wrong-code");
    fill(root, { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, '[part="error"]')).toBe(
      "This reset link is not valid or has expired. Ask for a new one.",
    );
    expect(control(root, "password").value).toBe("");
    expect(control(root, "passwordConfirmation").value).toBe("");
    expect(button(root, "idg-button.submit").loading).toBe(false);
  });

  it("offers a slot for the link to ask for a new code", async () => {
    const { root } = await mount("complete", undefined, "code");
    expect(shadowOf(root).querySelector('slot[name="request"]')).not.toBeNull();
  });

  it("clears both passwords when it is disconnected", async () => {
    const { root } = await mount("complete", undefined, "code");
    fill(root, { password: PASSWORD, passwordConfirmation: PASSWORD });
    const fields = [control(root, "password"), control(root, "passwordConfirmation")];
    removeHost(root);
    expect(fields.map((field) => field.value)).toEqual(["", ""]);
  });
});

describe("idg-password-reset modes", () => {
  it("falls back to request for a mode it does not know, and switches when the mode changes", async () => {
    const { root, waitForChanges } = await mount("other" as "request");
    expect(shadowOf(root).querySelector('[name="email"]')).not.toBeNull();
    root.mode = "complete";
    await waitForChanges();
    expect(shadowOf(root).querySelector('[name="password"]')).not.toBeNull();
  });

  it("uses the labels it is given", async () => {
    const { root, waitForChanges } = await mount("request");
    root.labels = { requestSubmit: "Link senden" };
    await waitForChanges();
    expect(button(root, "idg-button.submit").textContent).toContain("Link senden");
  });
});
