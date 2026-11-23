import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import type { IdentityClient, IdentityState } from "@identgineer/identity";
import { recordEvents, shadowOf, textOf } from "../../testing/identity-form";
import { identitySetup, settle } from "../../testing/identity-harness";
import { installPopoverElement } from "../../testing/popover-element";
import { removeHost } from "../../testing/remove-host";
import "../avatar/avatar";
import "../button/button";
import "../menu/menu";
import "../menu-group/menu-group";
import "../menu-item/menu-item";
import "../menu-separator/menu-separator";
import "./user-menu";

interface UserMenuElement extends HTMLElement {
  client?: unknown;
  labels?: Record<string, string>;
  avatarSrc?: string;
  displayName?: string;
}

async function mount(client?: unknown, children?: unknown) {
  const rendered = await render(<idg-user-menu>{children}</idg-user-menu>);
  const root = rendered.root as UserMenuElement;
  if (client) root.client = client;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

function menu(root: HTMLElement): HTMLElement | null {
  return shadowOf(root).querySelector("idg-menu");
}

function choose(root: HTMLElement, value: string): CustomEvent {
  const event = new CustomEvent("idgSelect", {
    detail: { value },
    bubbles: true,
    composed: true,
  });
  menu(root)?.dispatchEvent(event);
  return event;
}

const SIGN_OUT = "idg-sign-out";

/** A client whose state the test sets, as another tab's sign-out would through the real one. */
function steerable(client: IdentityClient) {
  let state: IdentityState = client.getState();
  const listeners = new Set<(next: IdentityState) => void>();
  return {
    client: {
      ...client,
      getState: () => state,
      subscribe: (listener: (next: IdentityState) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    set(next: IdentityState) {
      state = next;
      for (const listener of listeners) listener(next);
    },
  };
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  installPopoverElement();
  events = recordEvents(["idgSignedOut", "idgSelect"]);
});

afterEach(() => {
  events.stop();
});

describe("idg-user-menu signed in", () => {
  it("is an avatar button, named for the user, that opens a menu of their account", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root } = await mount(client);
    const trigger = shadowOf(root).querySelector('idg-menu > idg-button[slot="trigger"]');
    expect(trigger).not.toBeNull();
    expect((trigger?.querySelector("idg-avatar") as { alt?: string } | null)?.alt).toBe("");
    expect((trigger?.querySelector("idg-avatar") as { name?: string } | null)?.name).toBe("ada");
    expect(textOf(root, 'idg-button[slot="trigger"] .visually-hidden')).toBe(
      "Account menu for ada",
    );
    const group = shadowOf(root).querySelector("idg-menu > idg-menu-group");
    expect((group as { label?: string } | null)?.label).toBe("Signed in as ada");
    expect(group?.querySelector('slot[name="items"]')).not.toBeNull();
    expect(textOf(root, `idg-menu-item[value="${SIGN_OUT}"]`)).toBe("Sign out");
  });

  it("shows the name and picture the page gives it", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    root.displayName = "Ada Lovelace";
    root.avatarSrc = "/avatars/ada.png";
    await waitForChanges();
    const avatar = shadowOf(root).querySelector("idg-avatar") as {
      name?: string;
      src?: string;
    } | null;
    expect(avatar?.name).toBe("Ada Lovelace");
    expect(avatar?.src).toBe("/avatars/ada.png");
  });

  it("lets the page's own items' choices through and keeps its sign-out's inside", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    choose(root, "profile");
    choose(root, SIGN_OUT);
    await settle(waitForChanges);
    expect(events.seen.filter((event) => event.type === "idgSelect")).toEqual([
      { type: "idgSelect", detail: { value: "profile" } },
    ]);
  });
});

describe("idg-user-menu signing out", () => {
  it("signs out, says so politely, and tells the page the outcome", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    choose(root, SIGN_OUT);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-out");
    expect(menu(root)).toBeNull();
    expect(textOf(root, '[role="status"]')).toBe("You are signed out.");
    expect(shadowOf(root).querySelector('[part="outcome"]')).toBeNull();
    expect(events.seen.filter((event) => event.type === "idgSignedOut")).toEqual([
      { type: "idgSignedOut", detail: { outcome: "signed-out" } },
    ]);
  });

  it("tells the user honestly when the server could not be reached", async () => {
    const { client, signIn, api } = identitySetup();
    await signIn();
    api.respondNext("POST", "/api/auth/logout", "network-error");
    const { root, waitForChanges } = await mount(client);
    choose(root, SIGN_OUT);
    await settle(waitForChanges);
    expect(client.getState().status).toBe("signed-out");
    const outcome = shadowOf(root).querySelector('[part="outcome"]');
    expect(outcome?.getAttribute("variant")).toBe("warning");
    expect(textOf(root, '[part="outcome"]')).toBe(
      "You are signed out on this device, but the server could not be reached. Your session may stay active there until it expires.",
    );
    expect(events.seen.filter((event) => event.type === "idgSignedOut")).toEqual([
      { type: "idgSignedOut", detail: { outcome: "server-unreachable" } },
    ]);
  });

  it("treats a superseded sign-out as no error: another tab's newer sign-in stands", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount({
      ...client,
      signOut: () => Promise.resolve({ outcome: "superseded" as const }),
    });
    choose(root, SIGN_OUT);
    await settle(waitForChanges);
    expect(shadowOf(root).querySelector('[part="outcome"]')).toBeNull();
    expect(textOf(root, '[role="status"]')).toBe("You are signed in from another tab.");
    expect(events.seen.filter((event) => event.type === "idgSignedOut")).toEqual([
      { type: "idgSignedOut", detail: { outcome: "superseded" } },
    ]);
  });

  it("signs out once for a double choice, the trigger busy meanwhile", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    let finish = (): void => undefined;
    const signOut = vi.fn(
      () =>
        new Promise<{ outcome: "signed-out" }>((resolve) => {
          finish = () => {
            resolve({ outcome: "signed-out" });
          };
        }),
    );
    const { root, waitForChanges } = await mount({ ...client, signOut });
    choose(root, SIGN_OUT);
    choose(root, SIGN_OUT);
    await waitForChanges();
    expect(signOut).toHaveBeenCalledTimes(1);
    const trigger = shadowOf(root).querySelector('idg-button[slot="trigger"]') as {
      loading?: boolean;
    } | null;
    expect(trigger?.loading).toBe(true);
    finish();
    await settle(waitForChanges);
  });

  it("says something went wrong when the client refuses to sign out", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount({
      ...client,
      signOut: () => Promise.reject(new Error("disposed")),
    });
    choose(root, SIGN_OUT);
    await settle(waitForChanges);
    expect(textOf(root, '[part="outcome"]')).toBe("Something went wrong. Try again later.");
    expect(events.seen.filter((event) => event.type === "idgSignedOut")).toEqual([]);
  });
});

describe("idg-user-menu state", () => {
  it("draws the signed-out slot when nobody is signed in, and restores once while unknown", async () => {
    const { client, api } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    expect(api.requests.filter((request) => request.path === "/api/auth/refresh")).toHaveLength(1);
    expect(menu(root)).toBeNull();
    expect(shadowOf(root).querySelector('slot[name="signed-out"]')).not.toBeNull();
  });

  it("tries a restore that could not reach the server again when the browser is back online", async () => {
    const { client, api } = identitySetup();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    expect(shadowOf(root).querySelector('slot[name="signed-out"]')).toBeNull();
    window.dispatchEvent(new Event("online"));
    await settle(waitForChanges);
    expect(shadowOf(root).querySelector('slot[name="signed-out"]')).not.toBeNull();
  });

  it("draws nothing without a client", async () => {
    const { root } = await mount();
    expect(menu(root)).toBeNull();
    expect(shadowOf(root).querySelector("slot")).toBeNull();
  });

  it("goes when the client hears another tab sign out, without an outcome of its own", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const tab = steerable(client);
    const { root, waitForChanges } = await mount(tab.client);
    expect(menu(root)).not.toBeNull();
    tab.set({ status: "signed-out", reason: "other-tab" });
    await waitForChanges();
    expect(menu(root)).toBeNull();
    expect(events.seen).toEqual([]);
  });

  it("stops listening once disconnected", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const tab = steerable(client);
    const { root } = await mount(tab.client);
    removeHost(root);
    tab.set({ status: "signed-out", reason: "other-tab" });
    expect(menu(root)).not.toBeNull();
  });

  it("uses the labels it is given", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    root.labels = { signOut: "Abmelden", trigger: "Konto von {name}" };
    await waitForChanges();
    expect(textOf(root, `idg-menu-item[value="${SIGN_OUT}"]`)).toBe("Abmelden");
    expect(textOf(root, 'idg-button[slot="trigger"] .visually-hidden')).toBe("Konto von ada");
  });
});
