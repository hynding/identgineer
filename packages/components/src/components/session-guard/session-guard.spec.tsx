import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import type { IdentityClient, IdentityState as IdentityStateView } from "@identgineer/identity";
import { recordEvents, shadowOf } from "../../testing/identity-form";
import { identitySetup, settle } from "../../testing/identity-harness";
import { removeHost } from "../../testing/remove-host";
import "./session-guard";

interface GuardElement extends HTMLElement {
  client?: unknown;
}

const content = [
  <p class="protected">Account settings</p>,
  <p slot="fallback">Sign in to see this.</p>,
  <p slot="pending">Checking…</p>,
];

async function mount(client?: IdentityClient) {
  const rendered = await render(<idg-session-guard>{content}</idg-session-guard>);
  const root = rendered.root as GuardElement;
  if (client) root.client = client;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

/** Which of the guard's slots it draws: the default slot is "content". */
function drawn(root: HTMLElement): string[] {
  return Array.from(shadowOf(root).querySelectorAll("slot")).map(
    (slot) => slot.getAttribute("name") ?? "content",
  );
}

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  events = recordEvents(["idgSessionChange"]);
});

afterEach(() => {
  events.stop();
});

describe("idg-session-guard", () => {
  it("draws only the pending slot without a client, never the protected content", async () => {
    const { root } = await mount();
    expect(drawn(root)).toEqual(["pending"]);
  });

  it("restores once while the state is unknown, then shows the fallback when nobody is signed in", async () => {
    const { client, api } = identitySetup();
    const restore = vi.fn(() => client.restore());
    const release = api.holdNext("POST", "/api/auth/refresh");
    const { root, waitForChanges } = await mount({ ...client, restore });
    expect(drawn(root)).toEqual(["pending"]);
    release();
    await settle(waitForChanges);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(api.requests.filter((request) => request.path === "/api/auth/refresh")).toHaveLength(1);
    expect(drawn(root)).toEqual(["fallback"]);
    expect(events.seen).toEqual([
      { type: "idgSessionChange", detail: { status: "unknown" } },
      { type: "idgSessionChange", detail: { status: "signed-out", reason: "no-session" } },
    ]);
  });

  it("shows the content only once signed in, and does not restore a client that knows", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const restore = vi.fn(() => client.restore());
    const { root } = await mount({ ...client, restore });
    expect(drawn(root)).toEqual(["content"]);
    expect(restore).not.toHaveBeenCalled();
    expect(events.seen).toEqual([{ type: "idgSessionChange", detail: { status: "signed-in" } }]);
  });

  it("follows each transition: sign-in and sign-out in this tab", async () => {
    const { client, signIn } = identitySetup();
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    await signIn();
    await waitForChanges();
    expect(drawn(root)).toEqual(["content"]);
    await client.signOut();
    await waitForChanges();
    expect(drawn(root)).toEqual(["fallback"]);
    expect(events.seen.map((event) => event.detail)).toEqual([
      { status: "unknown" },
      { status: "signed-out", reason: "no-session" },
      { status: "signed-in" },
      { status: "signed-out", reason: "user" },
    ]);
  });

  // The mock DOM's events cannot carry a BroadcastChannel message, so the client hears of the
  // other tab here through a stand-in; the browser tests sign out in a real second client.
  it("hides the content when the client hears another tab sign out", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const listeners = new Set<(state: IdentityStateView) => void>();
    let state = client.getState();
    const tab = {
      ...client,
      getState: () => state,
      subscribe: (listener: (next: IdentityStateView) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const { root, waitForChanges } = await mount(tab);
    state = { status: "signed-out", reason: "other-tab" };
    for (const listener of listeners) listener(state);
    await waitForChanges();
    expect(drawn(root)).toEqual(["fallback"]);
    expect(events.seen.at(-1)?.detail).toEqual({ status: "signed-out", reason: "other-tab" });
  });

  it("follows a swapped client, and goes back to pending when the client is taken away", async () => {
    const signedIn = identitySetup();
    await signedIn.signIn();
    const signedOut = identitySetup();
    await signedOut.client.restore();
    const { root, waitForChanges } = await mount(signedIn.client);
    expect(drawn(root)).toEqual(["content"]);
    root.client = signedOut.client;
    await waitForChanges();
    expect(drawn(root)).toEqual(["fallback"]);
    root.client = undefined;
    await waitForChanges();
    expect(drawn(root)).toEqual(["pending"]);
  });

  it("stops listening once disconnected", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root } = await mount(client);
    removeHost(root);
    await client.signOut();
    expect(events.seen).toEqual([{ type: "idgSessionChange", detail: { status: "signed-in" } }]);
  });

  it("says the server could not be reached when the restore fails, and tries again on Try again", async () => {
    const { client, api } = identitySetup();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    expect(drawn(root)).toEqual([]);
    const notice = shadowOf(root).querySelector('[part="unreachable"]');
    expect(notice?.textContent).toContain(
      "The service could not be reached. Check your connection and try again.",
    );
    expect(events.seen.at(-1)?.detail).toEqual({ status: "unreachable" });
    shadowOf(root).querySelector<HTMLElement>('[part="retry"]')?.click();
    await settle(waitForChanges);
    expect(drawn(root)).toEqual(["fallback"]);
    expect(api.requests.filter((request) => request.path === "/api/auth/refresh")).toHaveLength(2);
  });

  it("tries the restore again when the browser comes back online", async () => {
    const { client, api } = identitySetup();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    const { root, waitForChanges } = await mount(client);
    await settle(waitForChanges);
    window.dispatchEvent(new Event("online"));
    await settle(waitForChanges);
    expect(drawn(root)).toEqual(["fallback"]);
    expect(shadowOf(root).querySelector('[part="unreachable"]')).toBeNull();
  });

  it("uses the labels it is given for the notice", async () => {
    const { client, api } = identitySetup();
    api.respondNext("POST", "/api/auth/refresh", "network-error");
    const { root, waitForChanges } = await mount(client);
    (root as GuardElement & { labels?: Record<string, string> }).labels = {
      retry: "Erneut versuchen",
    };
    await settle(waitForChanges);
    expect(shadowOf(root).querySelector('[part="retry"]')?.textContent).toBe("Erneut versuchen");
  });

  it("keeps a sign-out its content could not confirm with the server in view, above the fallback", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    root.querySelector(".protected")?.dispatchEvent(
      new CustomEvent("idgSignedOut", {
        detail: { outcome: "server-unreachable", everywhere: true },
        bubbles: true,
        composed: true,
      }),
    );
    await client.signOut();
    await waitForChanges();
    expect(drawn(root)).toEqual(["sign-out-outcome", "fallback"]);
    const notice = shadowOf(root).querySelector('[part="sign-out-outcome"]');
    expect(notice?.getAttribute("variant")).toBe("warning");
    expect(notice?.textContent).toBe(
      "You are signed out on this device, but the server could not be reached, so your other sessions may stay signed in until they expire. Sign in and try again once you are back online.",
    );
    notice?.dispatchEvent(new CustomEvent("idgDismiss", { cancelable: true }));
    await waitForChanges();
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')).toBeNull();
  });

  it("says a sign-out of this device only could not reach the server, and forgets it once signed in", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    root.querySelector(".protected")?.dispatchEvent(
      new CustomEvent("idgSignedOut", {
        detail: { outcome: "server-unreachable" },
        bubbles: true,
        composed: true,
      }),
    );
    await client.signOut();
    await waitForChanges();
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')?.textContent).toBe(
      "You are signed out on this device, but the server could not be reached. Your session may stay active there until it expires.",
    );
    await signIn();
    await client.signOut();
    await waitForChanges();
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')).toBeNull();
  });

  it("shows no notice after a sign-out the server confirmed", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    await client.signOut();
    root.querySelector(".protected")?.dispatchEvent(
      new CustomEvent("idgSignedOut", {
        detail: { outcome: "signed-out", everywhere: true },
        bubbles: true,
        composed: true,
      }),
    );
    await waitForChanges();
    expect(drawn(root)).toEqual(["fallback"]);
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')).toBeNull();
  });

  it("forgets a sign-out notice when it is given another client", async () => {
    const { client, signIn } = identitySetup();
    await signIn();
    const { root, waitForChanges } = await mount(client);
    root.querySelector(".protected")?.dispatchEvent(
      new CustomEvent("idgSignedOut", {
        detail: { outcome: "server-unreachable" },
        bubbles: true,
        composed: true,
      }),
    );
    await client.signOut();
    await waitForChanges();
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')).not.toBeNull();
    const other = identitySetup();
    await other.client.restore().catch(() => undefined);
    root.client = other.client;
    await settle(waitForChanges);
    expect(drawn(root)).toEqual(["fallback"]);
    expect(shadowOf(root).querySelector('[part="sign-out-outcome"]')).toBeNull();
  });

  it("ignores a client property that is not a client", async () => {
    const { root, waitForChanges } = await mount();
    root.client = { getState: "nope" };
    await waitForChanges();
    expect(drawn(root)).toEqual(["pending"]);
  });
});
