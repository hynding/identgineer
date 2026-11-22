// Wires every identity component on the page to one real identity client on the SDK's fake API,
// served from this origin as plain modules (built into /identity-sdk by the components build),
// so the strict policy holds. The page creates the client; the components never do.
import { createIdentityClient } from "/identity-sdk/index.js";
import { createFakeIdentityApi } from "/identity-sdk/testing/fake-identity-api.js";

const PASSWORD = "correct horse battery staple";
const TAGS = [
  "idg-sign-in",
  "idg-register",
  "idg-password-reset",
  "idg-session-guard",
  "idg-profile",
  "idg-user-menu",
];
const EVENTS = [
  "idgSignedIn",
  "idgProviderSignIn",
  "idgRegistered",
  "idgResetRequested",
  "idgPasswordReset",
  "idgProfileSaved",
  "idgPasswordChanged",
  "idgSessionRevoked",
  "idgSignedOut",
  "idgSessionChange",
  "idgSelect",
];

const params = new URLSearchParams(location.search);
const api = createFakeIdentityApi({
  emailConfirmation: params.has("confirm"),
  providers: ["github"],
  sessions: params.get("sessions") === "legacy" ? "legacy" : "refresh",
});
api.addUser({ username: "ada", email: "ada@example.com", password: PASSWORD });

/** A client on the fake; a second one on the same channel stands in for another tab. */
const makeClient = () =>
  createIdentityClient({ baseUrl: api.baseUrl, fetch: api.fetch, channelName: "identity-fixture" });

const client = makeClient();
const events = [];
for (const name of EVENTS) {
  document.addEventListener(name, (event) => {
    events.push({ type: event.type, detail: event.detail ?? null });
  });
}

await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
for (const element of document.querySelectorAll(TAGS.join(", "))) element.client = client;
document.getElementById("sign-in").providers = [{ name: "github", label: "GitHub" }];

window.identityFixture = { api, client, makeClient, events, password: PASSWORD };
document.documentElement.dataset.identityReady = "true";
