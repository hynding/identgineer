import { afterEach } from "vitest";
import { createIdentityClient, type IdentityClient } from "@identgineer/identity";
import {
  createFakeIdentityApi,
  createManualClock,
  type FakeIdentityApiOptions,
  type FakeResponse,
} from "@identgineer/identity/testing";

export const START = Date.UTC(2026, 0, 1, 12, 0, 0);
export const PASSWORD = "correct horse battery staple";

const disposers: (() => void)[] = [];
let channel = 0;

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

/**
 * The real identity client on the SDK's fake API and a manual clock, as the components meet it in
 * a page. No lock manager and no online listener: the unit tests run one tab at a time, except
 * where a second client on the same channel stands in for another tab.
 */
export function identitySetup(apiOptions: FakeIdentityApiOptions = {}) {
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock, ...apiOptions });
  channel += 1;
  const channelName = `identgineer-components-test-${String(channel)}`;
  const makeClient = (): IdentityClient => {
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock,
      locks: null,
      onOnline: null,
      channelName,
    });
    disposers.push(client.dispose);
    return client;
  };
  const client = makeClient();
  const ada = api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  const signIn = () => client.signIn({ identifier: "ada@example.com", password: PASSWORD });
  return { api, clock, client, ada, signIn, makeClient };
}

/** Lets the fake's answers, the client's promise chains and the component's renders run. */
export async function settle(waitForChanges: () => Promise<void>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await waitForChanges();
  }
}

/** A 429 as camis answers it, with the wait in `Retry-After`. */
export function throttledAnswer(seconds: number): FakeResponse {
  return {
    status: 429,
    headers: { "Retry-After": String(seconds) },
    body: {
      data: null,
      error: { status: 429, name: "RateLimitError", message: "Too Many Attempts.", details: {} },
    },
  };
}
