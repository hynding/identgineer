import { afterEach } from "vitest";
import { createIdentityClient, type IdentityClientOptions } from "./identity-client.ts";
import type { IdentityState } from "./session.ts";
import { createFakeIdentityApi, type FakeIdentityApiOptions } from "./testing/fake-identity-api.ts";
import { createManualClock } from "./testing/manual-clock.ts";

export const START = Date.UTC(2026, 0, 1, 12, 0, 0);
export const PASSWORD = "correct horse battery staple";

const disposers: (() => void)[] = [];
let channel = 0;

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

/** A client wired to a fresh fake API on a manual clock, with every state it emits recorded. */
export const setup = (
  apiOptions: FakeIdentityApiOptions = {},
  clientOptions: Partial<IdentityClientOptions> = {},
) => {
  const clock = createManualClock(START);
  const api = createFakeIdentityApi({ clock, ...apiOptions });
  channel += 1;
  const sharedChannel = `identgineer-test-${String(channel)}`;
  let own = 0;
  /** Another client on the same fake: a tab of the same page with `sharedChannel`, else apart. */
  const makeClient = (options: { readonly sharedChannel?: boolean } = {}) => {
    own += 1;
    const client = createIdentityClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      clock,
      channelName:
        options.sharedChannel === true ? sharedChannel : `${sharedChannel}-own-${String(own)}`,
      ...clientOptions,
    });
    disposers.push(client.dispose);
    return client;
  };
  const client = makeClient({ sharedChannel: true });
  const states: IdentityState[] = [];
  client.subscribe((state) => states.push(state));
  const ada = api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });
  const signIn = () => client.signIn({ identifier: "ada@example.com", password: PASSWORD });
  return { api, clock, client, states, ada, signIn, makeClient, channelName: sharedChannel };
};

/** Lets pending promise chains and the fake's answers run. */
export const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

export const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
};
