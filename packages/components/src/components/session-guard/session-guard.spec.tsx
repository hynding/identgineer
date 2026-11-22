import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import type { IdentityClient } from "@identgineer/identity";
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
    const restore = vi.spyOn(client, "restore");
    const { root, waitForChanges } = await mount(client);
    expect(drawn(root)).toEqual(["pending"]);
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
    const restore = vi.spyOn(client, "restore");
    const { root } = await mount(client);
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

  it("hides the content when another tab signs out", async () => {
    const { client, signIn, makeClient } = identitySetup();
    await signIn();
    const otherTab = makeClient();
    await otherTab.restore();
    const { root, waitForChanges } = await mount(client);
    await otherTab.signOut();
    await settle(waitForChanges);
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

  it("ignores a client property that is not a client", async () => {
    const { root, waitForChanges } = await mount();
    root.client = { getState: "nope" };
    await waitForChanges();
    expect(drawn(root)).toEqual(["pending"]);
  });
});
