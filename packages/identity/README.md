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
`clock` (`now`, `setTimeout`, `clearTimeout`), `requestTimeoutMs` (default 15000),
`channelName` (the BroadcastChannel name, default `identgineer-identity`),
`accessTokenLifetimeSeconds` (default 600, camis' `CAMIS_ACCESS_TOKEN_LIFESPAN`; see Refresh) and
`locks` (an object with `request(name, callback)` as `navigator.locks`; by default
`navigator.locks` where the browser has it, and `null` turns locking off).

## API

Every method rejects with an `IdentityError` only. After `dispose()` every method rejects with
code `unknown` without sending anything, and `providerSignInUrl` throws it.

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
| `dispose()`                                                           | none                                                       | stops timers and the cross-tab channel; see below     |

Sign-ins (`signIn`, `completeProviderSignIn`) run one after another, so with two calls the later
one decides who is signed in. An answer that arrives after `signOut`, a later sign-in or `dispose()`
is dropped: its call rejects (`unauthorized`, or `unknown` once disposed), no token is kept, and
a session it opened on the server is ended. `dispose()` ends nothing on the server and announces
nothing to other tabs.

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
always returns in the body.

The next refresh is scheduled from the access token's lifetime, measured from when the answer
arrived, so a wrong client clock does not matter (except for an `expiresAt`, or a JWT without `iat`). The lifetime is, first found: an `expiresIn`
(seconds) in the answer, an `expiresAt` (an ISO date or epoch milliseconds) less the client's
time, a JWT's `exp` less its `iat` (or less the client's time without `iat`), or `accessTokenLifetimeSeconds` (default 600) for strapi-php's opaque Sanctum
tokens, which say nothing about their life. The refresh runs 30 seconds before the end of that
lifetime, or halfway through a lifetime under a minute. If that would be under 5 seconds it waits
5 seconds, doubling up to 5 minutes for as long as tokens stay that short. Long waits (a 30-day
legacy JWT) are armed in one-day steps, below `setTimeout`'s limit. A JWT is read defensively and
never trusted for anything else.

A refused refresh (400, 401 or 403) signs out with `reason: "expired"`. A backend without sessions
(the refresh route answers 404) keeps the token: if its lifetime was known, the client signs out at
its end; if the lifetime was only the configured guess, the session lasts until the server refuses
the token. A refresh that cannot reach the server is tried again after 30 seconds, until a known
expiry passes. Concurrent 401s share one refresh, and a request that gets a 401 is retried once on
the refreshed token, but only if the same session is still current: a request sent before a
sign-out or a sign-in as someone else is never retried with the new user's token (`authorizedFetch`
returns the 401, other methods reject with `unauthorized`).

The refresh cookie is shared by every tab. A cookie refresh runs under the Web Lock
`identgineer-identity-refresh` (where `locks` is available), so tabs do not present the same
single-use refresh token at once, and a cookie refresh refused with 401 is retried once, in case
another tab rotated the cookie in between. After every cookie refresh the client reads
`GET /api/users/me` with the new token: if the cookie now belongs to another user (another tab
signed in as them), this tab drops the tokens and signs out with `reason: "user-changed"`.

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
other tabs drop their tokens and announce `reason: "other-tab"`. A sign-in posts
`{ type: "signed-in" }`: a signed-out tab then runs `restore()` and picks the session up from the
cookie, and a signed-in tab holding no refresh token of its own refreshes from the cookie at once,
which signs it out with `user-changed` if the other tab signed in as someone else. No token or user
is sent, and any other message is ignored.

**Sign-out.** `signOut` signs out locally and tells other tabs at once, then ends the session on
the server. When the tab holds no access token (the state is still `unknown`, or a `restore()` is
in flight) it waits for that refresh, or refreshes from the cookie itself, so that the cookie
session is ended too and a reload does not sign back in. It sends nothing when the tab already
knew it was signed out.

**Input.** Provider names and session and document ids are checked against strict patterns and
URL-encoded. `authorizedFetch` resolves its target first (a path beginning with `/` is joined to
`baseUrl`'s path), then refuses it unless it has `baseUrl`'s origin and lies under its path; `//`
and backslashes are refused outright, so `/../admin` cannot climb out of a base path and the token
never reaches another origin. Every bearer request, `authorizedFetch` included, is sent with
`redirect: "error"`, so a redirect cannot carry the token elsewhere. `completeProviderSignIn` returns `returnTo` only if it is a same-origin relative
path (no `//host`, backslashes, schemes, control or separator characters, or encoded slashes).
Answers are size-limited, parsed with keys like `__proto__` refused, and shape-checked. Every
request is aborted after `requestTimeoutMs`.

## Backend configuration this client needs

- **Sessions:** `CAMIS_JWT_MANAGEMENT=refresh` on strapi-php (`jwtManagement: 'refresh'` on
  Strapi). Without it there is no refresh, `restore()` finds no session, the session ends on
  reload and `signOut` cannot revoke the token on the server. Set `accessTokenLifetimeSeconds` to the
  backend's access token lifetime (`CAMIS_ACCESS_TOKEN_LIFESPAN`, default 600) if it was changed.
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
- Each cookie refresh costs one extra `GET /api/users/me` (the user check under Refresh).
- Without Web Locks (older browsers) two tabs can still present the same refresh cookie at once;
  the one retry covers the usual case.

## Testing

`@identgineer/identity/testing` exports `createFakeIdentityApi(options)`, an in-memory stand-in for
the endpoints above with strapi-php's behaviour (error envelope, guest routes refusing a bearer
token, refresh and legacy modes, cookie mode, throttling, a browser-like cookie jar read when each
request is sent), `createManualClock(start)` and `createMemoryLocks()` (an in-memory lock manager
for the `locks` option). Pass `api.fetch`, `api.baseUrl` and the clock to the client. The fake
issues opaque tokens by default, living 600 seconds in refresh mode and 30 days in legacy mode
(`accessTokens: "jwt"`, `accessTokenLifetimeSeconds` and `reportExpiresIn` change that), and
`api.holdNext(method, path)` holds the next such request until the returned function is called, to
interleave tabs and races.

`src/camis-contract.test.ts` checks the client's routes, methods and body fields against camis'
strapi-php emitter and route golden when `CAMIS_DIR` names a camis checkout (as for
`pnpm cms:validate`); without it the checks are skipped with a note.
