# @identgineer/identity

A typed, framework-free browser client for the CMS's users-permissions API: sign-in, registration,
password recovery, email confirmation, sessions, provider sign-in and the owner's `Profile`. It
works against both CMS targets (see [cms/README.md](../../cms/README.md)): strapi-php on shared
hosting and Strapi 5 locally. It has no runtime dependencies and keeps tokens in memory only.

## Use it

```ts
import { createIdentityClient, IdentityError } from "@identgineer/identity";

const identity = createIdentityClient({ baseUrl: "https://cms.example.com" });

identity.subscribe((state) => {
  // { status: "unknown" } | { status: "signed-out", reason } | { status: "signed-in", user }
  render(state);
});

await identity.restore(); // once at start: resumes the session from the refresh cookie

try {
  await identity.signIn({ identifier: "ada@example.com", password });
} catch (error) {
  if (error instanceof IdentityError && error.code === "throttled") {
    showCountdown(error.retryAfterSeconds); // or poll identity.retryAfterSeconds()
  }
}

// Other packages (tracking, brand kits) call the CMS through this:
const response = await identity.authorizedFetch("/api/brand-kits");
```

`createIdentityClient(options)` takes `baseUrl` (`https:`, or `http:` on `localhost`,
`127.0.0.1` or `[::1]` for development; no credentials, query or fragment), and optionally `fetch`,
`clock` (`now`, `setTimeout`, `clearTimeout`), `requestTimeoutMs` (default 15000) and
`channelName` (the BroadcastChannel name, default `identgineer-identity`).

## API

Every method rejects with an `IdentityError` only.

| Method                                                                | Request                                                    | Resolves to                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `signIn({ identifier, password })`                                    | `POST /api/auth/local`                                     | the user                                              |
| `register({ username, email, password })`                             | `POST /api/auth/local/register`                            | `{ outcome: "check-email" }` or `signed-in` with user |
| `signOut({ everywhere? })`                                            | `POST /api/auth/logout`                                    | nothing; always signs out locally                     |
| `currentUser()`                                                       | `GET /api/users/me`                                        | the user (also updates the state)                     |
| `requestPasswordReset({ email })`                                     | `POST /api/auth/forgot-password`                           | `{ outcome: "accepted" }`                             |
| `resetPassword({ code, password, passwordConfirmation })`             | `POST /api/auth/reset-password`                            | the user, signed in                                   |
| `confirmEmail({ confirmation })`                                      | `GET /api/auth/email-confirmation` (redirect not followed) | nothing                                               |
| `resendConfirmation({ email })`                                       | `POST /api/auth/send-email-confirmation`                   | `{ outcome: "accepted" }`                             |
| `changePassword({ currentPassword, password, passwordConfirmation })` | `POST /api/auth/change-password`                           | nothing; the session continues on new tokens          |
| `listSessions()`                                                      | `GET /api/auth/sessions`                                   | the account's sessions, this one `current`            |
| `revokeSession(id)`                                                   | `DELETE /api/auth/sessions/{id}`                           | nothing                                               |
| `getProfile()`                                                        | `GET /api/profiles`                                        | the owner's profile, or `null`                        |
| `saveProfile(input)`                                                  | `POST /api/profiles` or `PUT /api/profiles/{documentId}`   | the saved profile                                     |
| `providerSignInUrl(provider, { callback? })`                          | builds `GET /api/connect/{provider}`                       | the URL to send the browser to                        |
| `completeProviderSignIn(provider, { search?, returnTo? })`            | `GET /api/auth/{provider}/callback`                        | `{ user, redirectTo }`                                |
| `restore()`                                                           | `POST /api/auth/refresh`, then `GET /api/users/me`         | the state                                             |
| `authorizedFetch(input, init?)`                                       | any path under `baseUrl`                                   | the `Response`                                        |
| `getState()`, `subscribe(listener)`                                   | none                                                       | the state; an unsubscribe function                    |
| `retryAfterSeconds()`                                                 | none                                                       | seconds until credential requests are accepted again  |
| `dispose()`                                                           | none                                                       | stops timers and the cross-tab channel                |

`saveProfile` takes `displayName` (required, up to 80 characters), `bio` (up to 500, or `null`),
`locale` (BCP 47), `timezone` (IANA) and `marketingOptIn`, checked against the limits in
`cms/camis.json`. Only these fields are sent; the server sets the owner.

Also exported: `passkeysSupported()`, `safeRedirectPath(path, fallback?)`, `IDENTITY_ERROR_CODES`
and the types.

### Errors

`IdentityError.code` is one of:

| Code                  | When                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `invalid-credentials` | Any failed sign-in (wrong password, unknown or blocked account), a wrong reset or confirmation code, a failed provider sign-in |
| `throttled`           | The server answered 429, or the client is holding attempts back; `retryAfterSeconds` says how long                             |
| `network`             | The CMS could not be reached, or the request timed out                                                                         |
| `validation`          | Input was refused; `fields` names the fields for registration and profile input only                                           |
| `unauthorized`        | No session, or the session ended                                                                                               |
| `email-not-confirmed` | The password was right but the address is not confirmed (the backend discloses this only then)                                 |
| `unknown`             | Anything else, including a malformed answer                                                                                    |

`message` is fixed per code. The backend's own messages are never passed on: they can tell
whether an account exists.

## Security model

**What is kept where**

| Value                                                                                                        | Where                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Access token                                                                                                 | A closure inside the client. Never on a returned object, in the state, in an error or a log |
| Refresh token, cookie mode (sign-in, provider sign-in, refresh)                                              | An HttpOnly cookie the CMS sets; page script never sees it                                  |
| Refresh token, body mode (registration, password reset or change, a backend that ignores the cookie request) | The same closure, in memory only                                                            |
| User                                                                                                         | The state, frozen                                                                           |

Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, the Cache API or a
script-readable cookie. A source-rule test fails if the package source mentions any of them or
`console`, and a behaviour test checks that a whole session leaves them empty.

**Refresh.** Sign-in sends `x-strapi-refresh-cookie: httpOnly`, so users-permissions sets the
refresh token as an HttpOnly cookie, and `restore()` presents it (`credentials: "include"`) after a
reload. A refresh token that came back in a body stays in memory: it is sent in the refresh body
without cookies, and **that session ends on reload**. This happens after `register` (on a backend
without email confirmation), `resetPassword` and `changePassword`, whose answers users-permissions
always returns in the body. Concurrent 401s share one refresh. A JWT access token (Strapi) is
refreshed 30 seconds before its `exp`, read defensively and never trusted for anything else;
strapi-php's opaque Sanctum tokens are refreshed on their first 401 instead. A refused refresh, or
an expired token that cannot be refreshed, signs out with `reason: "expired"`.

**CSRF.** `credentials: "include"` is used only where the cookie is needed: sign-in, refresh,
logout and the provider callback. Those requests carry `X-Requested-With: identgineer` and the
refresh-cookie header, and the writes a JSON body, so none is a CORS "simple" request: the browser
preflights it and the CMS's CORS allow-list decides. State changes are never sent as a GET, except
the two GETs users-permissions defines (`/auth/email-confirmation`, the provider callback). Every
other request omits credentials and sends the bearer token.

**Enumeration.** `register` (with email confirmation on), `requestPasswordReset` and
`resendConfirmation` resolve to the same frozen value for existing and unknown accounts, even
where the backend answers differently: a taken address or username, "already confirmed", "user
blocked" and a server failure only an existing account can reach all resolve as success. Every
failed sign-in is `invalid-credentials`. Without email confirmation a new account is signed in at
once, so registration cannot hide that an address was free.

**Throttling.** After a 429 the client refuses credential requests locally for the `Retry-After`
time (60 seconds, the CMS's throttle window, when the header is missing or hidden by CORS). After
two failed sign-ins in a row each further failure doubles a local wait, from 2 seconds up to 5
minutes; a successful sign-in resets it.

**Cross-tab.** `signOut` posts `{ type: "signed-out" }` on a BroadcastChannel (where available);
other tabs drop their tokens and announce `reason: "other-tab"`. No token or user is sent.

**Input.** Provider names and session and document ids are checked against strict patterns and
URL-encoded. `authorizedFetch` refuses any URL outside `baseUrl`, so the token never reaches
another origin. `completeProviderSignIn` returns `returnTo` only if it is a same-origin relative
path (no `//host`, backslashes, schemes, control or separator characters, or encoded slashes).
Answers are size-limited, parsed with keys like `__proto__` refused, and shape-checked. Every
request is aborted after `requestTimeoutMs`.

## Backend configuration this client needs

- **Sessions:** `CAMIS_JWT_MANAGEMENT=refresh` on strapi-php (`jwtManagement: 'refresh'` on
  Strapi). Without it there is no refresh, `restore()` finds no session, the session ends on
  reload and `signOut` cannot revoke the token on the server.
- **Cookie:** `CAMIS_SESSIONS_COOKIE_SECURE=true` and `CAMIS_SESSIONS_COOKIE_SAME_SITE=strict`
  (the defaults are production-only Secure and `lax`).
- **CORS:** the CMS must allow the client's headers and expose `Retry-After`:
  `CAMIS_CORS_HEADERS=Content-Type,Authorization,Origin,Accept,X-Requested-With,x-strapi-refresh-cookie`,
  `CAMIS_CORS_EXPOSE=Retry-After`, and `CAMIS_CORS_ORIGIN` set to the site's origin (never `*`).
  Strapi needs the same in its `strapi::cors` middleware options.

## Provider sign-in

```ts
location.assign(
  identity.providerSignInUrl("github", { callback: "https://app.example/auth/github" }),
);

// On the callback page:
const { redirectTo } = await identity.completeProviderSignIn("github", {
  search: location.search,
  returnTo: pathTheUserStartedFrom, // from your router, not from the query
});
history.replaceState(null, "", location.pathname); // drop any provider tokens from the address bar
location.assign(redirectTo);
```

strapi-php keeps the provider's answer in the round trip's session cookie, so the callback request
includes credentials. Strapi instead puts the provider's `access_token` in the callback page's
query; the client passes on `access_token`, `id_token` and `access_secret` from `search` and
nothing else.

## Passkeys

`passkeysSupported()` tells whether the browser has a user-verifying platform authenticator in a
secure context. There is no passkey sign-in: the CMS has no WebAuthn endpoints. When it has, a
passkey sign-in belongs beside `signIn` as one more credential operation (challenge, then
`navigator.credentials.get()`, then post the assertion through the same throttled transport and
sign in from the token answer); see `src/passkeys.ts`.

## Limits

- A session whose refresh token arrived in a body does not survive a reload (see Refresh).
- After `resetPassword` or `changePassword` the old refresh cookie still names an ended session, so
  a reload signs out until the next sign-in.
- `revokeSession` on the current session ends it on the server; this client notices on its next
  request. Use `signOut` instead.
- `authorizedFetch` retries with the same `init`, so its body must be re-sendable (not a stream).
- Profile avatars are not handled: upload and link them through `authorizedFetch`.
- `restore()` on a network failure leaves the state `unknown` and rejects, so the caller can retry.

## Testing

`@identgineer/identity/testing` exports `createFakeIdentityApi(options)`, an in-memory stand-in for
the endpoints above with strapi-php's behaviour (error envelope, guest routes refusing a bearer
token, refresh and legacy modes, cookie mode, throttling, a browser-like cookie jar), and
`createManualClock(start)`. Pass `api.fetch`, `api.baseUrl` and the clock to the client.

`src/camis-contract.test.ts` checks the client's routes, methods and body fields against camis'
strapi-php emitter and route golden when `CAMIS_DIR` names a camis checkout (as for
`pnpm cms:validate`); without it the checks are skipped with a note.
