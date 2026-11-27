import {
  bullets,
  code,
  example,
  h2,
  link,
  p,
  page,
  repository,
  sample,
  table,
  warning,
} from "../authoring";

export const IDENTITY = page({
  slug: "identity",
  title: "Accounts, sign-in and sessions",
  summary:
    "A typed browser client for the CMS's accounts, and web components for sign-in, registration, password reset, the profile, a session guard and a user menu.",
  body: [
    p(
      code("@identgineer/identity"),
      " talks to the CMS, strapi-php on shared hosting or Strapi 5 locally, and has no runtime dependencies. The elements of ",
      code("@identgineer/components"),
      " are given that client and call its methods; they never see a token.",
    ),
    example(
      "sign-in",
      "The sign-in form, drawn in the current look. This preview is not connected.",
    ),
    h2("The client"),
    p(
      "Create one client for the page, listen to its state and restore the session once at the start:",
    ),
    sample(
      "ts",
      `
import { createIdentityClient, IdentityError } from "@identgineer/identity";

const identity = createIdentityClient({ baseUrl: "https://cms.example.com" });

identity.subscribe((state) => render(state));
await identity.restore(); // resumes the session from the refresh cookie

try {
  await identity.signIn({ identifier: "ada@example.com", password });
} catch (error) {
  if (error instanceof IdentityError && error.code === "throttled") {
    showCountdown(error.retryAfterSeconds);
  }
}
`,
      "Signing in",
    ),
    p(
      "Every method rejects with an ",
      code("IdentityError"),
      " and nothing else. Its message is fixed for each code, and the server's own words are never passed on, since they could say whether an account exists.",
    ),
    table(
      "What an IdentityError's code means",
      ["Code", "When"],
      [
        [
          code("invalid-credentials"),
          "Any failed sign-in: a wrong password, an unknown account or a blocked one",
        ],
        [
          code("throttled"),
          "The server answered 429, or the client is holding attempts back for a while",
        ],
        [code("network"), "The CMS could not be reached, or the request timed out"],
        [code("validation"), "The input was refused before anything was sent"],
        [code("unauthorized"), "There is no session, or it has ended"],
        [
          code("email-not-confirmed"),
          "The password was right but the address is not confirmed yet",
        ],
        [code("unknown"), "Anything else, a malformed answer included"],
      ],
    ),
    h2("Sessions"),
    bullets(
      "The access token is held in a variable, and the refresh token is an HttpOnly cookie on backends that set one. Nothing is written to local storage, session storage, cookies a script can read or IndexedDB.",
      "A session refreshes itself before its token runs out, once across every open tab, using Web Locks where the browser has them.",
      "Signing out in one tab signs out every tab, and protected content leaves the page at once.",
      "Calls that change the session run in order, so of two sign-ins the later one decides who is signed in.",
    ),
    h2("The components"),
    p(
      "Six elements put the client on a page: ",
      code("idg-sign-in"),
      ", ",
      code("idg-register"),
      ", ",
      code("idg-password-reset"),
      ", ",
      code("idg-profile"),
      ", ",
      code("idg-session-guard"),
      " and ",
      code("idg-user-menu"),
      ". Each takes it as its ",
      code("client"),
      " property, never creates one, and stores nothing in the browser.",
    ),
    bullets(
      "Real autocomplete hints on every field, so password managers know what each one is for",
      "Errors named on their field, focus moved to the first, and a summary drawn afresh for every attempt",
      "A countdown that says how long to wait when sign-in is throttled",
      "Passwords read from the field at submit and never kept, written to an attribute or put in an event",
    ),
    warning(
      "The session guard is not access control",
      "It shows its content only while someone is signed in, but that content is in the page all along, where any script or view of the source can read it. Every protected resource must be refused by the server to a request without a valid token.",
    ),
    h2("No hint that an account exists"),
    bullets(
      "A failed sign-in shows one message for a wrong password, an unknown account and a blocked one.",
      "Registering with an address already taken shows the same confirmation, in the same markup, as a new account waiting for its email, as long as the CMS confirms addresses.",
      "A password reset request shows the same confirmation for every address.",
    ),
    h2("What the CMS must be set to"),
    p(
      "The client needs a few settings on strapi-php (and the same in Strapi's configuration). The repository's ",
      code("cms/.env.example"),
      " lists each with its reason.",
    ),
    bullets(
      [
        code("CAMIS_JWT_MANAGEMENT=refresh"),
        ", or there is no refresh and a reload ends the session",
      ],
      [
        code("CAMIS_EMAIL_CONFIRMATION=true"),
        " and ",
        code("CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE=true"),
        ", so every address is answered alike",
      ],
      [
        "A secure, ",
        code("SameSite=Strict"),
        " session cookie, and CORS that allows the site's own origin, never every origin",
      ],
    ),
    h2("Not there yet"),
    p(
      "There is no passkey sign-in, because the CMS has no WebAuthn endpoints, and the client does not upload profile pictures. The framework guides cover the rest: ",
      link(repository("docs/identity/plain-html.md"), "plain HTML"),
      ", ",
      link(repository("docs/identity/react.md"), "React"),
      ", ",
      link(repository("docs/identity/vue.md"), "Vue"),
      " and ",
      link(repository("docs/identity/angular.md"), "Angular"),
      ", with the ",
      link("/docs/security/", "security notes"),
      ".",
    ),
  ],
});
