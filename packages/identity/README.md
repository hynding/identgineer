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
`accessTokenLifetimeSeconds` (default 600, camis' `CAMIS_ACCESS_TOKEN_LIFESPAN`; used only when
an answer does not say how long its token lives; see Refresh),
`locks` (an object with `request(name, callback)` as `navigator.locks`; by default
`navigator.locks` where the browser has it, and `null` turns locking off) and `onOnline` (a
function that subscribes a listener to the browser coming back online and returns the function
that unsubscribes it, typed `OnlineSubscription`; by default the window's `online` event, and
`null` turns it off). `requestTimeoutMs` and `accessTokenLifetimeSeconds` must be positive and at
most 2^31−1 milliseconds (about 24.8 days, the longest delay `setTimeout` keeps); anything else
throws a `TypeError` at creation, as an invalid `baseUrl` does.

## API

Every method rejects with an `IdentityError` only (`providerSignInUrl` and `subscribe` throw
one). Inputs are checked by type as well as by value, so a JavaScript caller passing `null`, a
number or an object where a string, options object or listener belongs gets `validation`, with
nothing sent and no failed attempt counted. So does a string with a lone surrogate (which JSON
would send as `\ud800` and `encodeURIComponent` cannot encode), an identifier, username or email
over 255 characters (camis' limit), a password over 72 bytes on registration, reset or change, a
reset code or confirmation token over 512 characters (camis issues 128 and 40), a provider
callback query over 16384 characters or a `returnTo` over 2048 characters, and `authorizedFetch` headers
that `Headers` cannot read or a `signal` that is not an `AbortSignal`. A sign-in's password and a
current password are capped at 4096 bytes, not 72: bcrypt reads only the first 72, so a longer
one set elsewhere still signs in. A token answer whose `jwt` or `refreshToken` is not visible
ASCII is refused as a malformed answer (`unknown`), since it could not be sent back. After `dispose()` every method rejects with code `unknown` without sending
anything, and `providerSignInUrl` throws it.

| Method                                                                | Request                                                    | Resolves to                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `signIn({ identifier, password })`                                    | `POST /api/auth/local`                                     | the user                                              |
| `register({ username, email, password })`                             | `POST /api/auth/local/register`                            | `{ outcome: "check-email" }` or `signed-in` with user |
| `signOut({ everywhere? })`                                            | `POST /api/auth/logout`                                    | `{ outcome }`; always signs out locally (see below)   |
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
| `authorizedFetch(input, init?)`                                       | any path or `URL` under `baseUrl`                          | the `Response`                                        |
| `getState()`, `subscribe(listener)`                                   | none                                                       | the state; an unsubscribe function                    |
| `retryAfterSeconds()`                                                 | none                                                       | seconds until credential requests are accepted again  |
| `dispose()`                                                           | none                                                       | stops timers and the cross-tab channel; see below     |

### Concurrency

Every piece of work that may change the session takes a ticket the moment it is called, before it
waits for anything, and its tokens enter the session only through one gate that refuses a stale
ticket. A sign-in's ticket (`signIn`, `completeProviderSignIn`, `register`, `resetPassword`) lasts
until a sign-out, here or in another tab, or `dispose()`; every other ticket (`changePassword`,
`restore()`, the re-check another tab's sign-in triggers, scheduled refreshes and their retries,
the refresh after a 401) lasts only while the session it was taken in does, so any sign-in or
sign-out ends it. Callers share a refresh in flight only within one session: a restore after a
sign-out never takes the answer of the old session's refresh. A
refresh's tokens are taken only while signed in: a signed-out client never holds a token, and on
sign-out every timer and `online` listener is cleared, and a completion that arrives afterwards
finds its ticket stale and does nothing.

Sign-ins, password changes, `restore()` and re-checks run one after another, in call order: with two sign-ins the
later one decides who is signed in, and a restore or re-check waits for a sign-in under way instead
of replacing it. A cancelled sign-in sends nothing if its turn has not come; if it has, its answer
is dropped, its call rejects (`unauthorized`, or `unknown` once disposed), no token is kept, and the
session it opened on the server is ended. A listener hears every transition in order, each as the
state of that transition; a sign-in rejects (`unauthorized`) if a listener signed out on hearing of
it. `dispose()` ends nothing on the server. It announces nothing to other tabs, except that a
sign-out still under way (and not superseded) tells them at once, since the page will not get to
tell them later. Such a sign-out finishes the logout of its own session if that was sent, but from
then on the tab can no longer hear of a newer sign-in, so it sends no cookie lookup, and no logout
of a session a lookup found, that had not been sent by the time of `dispose()`. It resolves
`server-unreachable` when that skipped a lookup or such a logout (it cannot say what is left); a
sign-out whose server work was already past those points, or that has nothing to look up (a
backend without sessions, or an own logout that already failed), resolves as it would have.

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
time, a JWT's `exp` less its `iat` (or less the client's time without `iat`), or
`accessTokenLifetimeSeconds` (default 600) when the answer and the token say nothing. What the
backend says wins over the configured guess; an `expiresIn` counts only as whole seconds from 1 to
a year, and anything else is skipped. camis answers `expiresIn` in refresh mode, so against
strapi-php the configured lifetime is not used. A token whose known lifetime has passed is never
sent: the client refreshes first. The refresh runs 30 seconds before the end of that
lifetime, or halfway through a lifetime under a minute, and never sooner than 5 seconds after the
token arrived (so a token living 5 to 10 seconds is refreshed every 5 seconds). Only
tokens living less than 5 seconds are refreshed with a wait that doubles, from 5 seconds up to 5
minutes, for as long as the server keeps issuing them. Long waits (a 30-day
legacy JWT) are armed in one-day steps, below `setTimeout`'s limit. A JWT is read defensively and
never trusted for anything else.

A refused refresh (400, 401 or 403) signs out with `reason: "expired"`. A backend without sessions
(the refresh route answers 404) keeps the token: if its lifetime was known, the client signs out at
its end; if the lifetime was only the configured guess, the session lasts until the server refuses
the token.

A refresh that cannot reach the server (a laptop waking before its network) never signs out, even
past a known expiry: the refresh cookie may well still be valid. It is tried again after 30
seconds, then with a wait that doubles up to 5 minutes (or the server's `Retry-After`, if it
throttled the refresh and asked for longer), and when the browser comes back online
(`onOnline`), though never sooner than 5 seconds after the last attempt, however often the event
fires, and not before a throttled refresh's `Retry-After` has passed. Meanwhile the state stays `signed-in`, but a token past its known expiry is
never sent: a request first tries the refresh itself and rejects with `network` while the server
stays out of reach (or `throttled`, with `retryAfterSeconds`, while it refuses refreshes with a 429). Only a refused refresh signs out. Concurrent 401s share one refresh, and a request that gets a 401 is retried once on
the refreshed token, but only if the same session is still current: a request sent before a
sign-out or a sign-in as someone else is never retried with the new user's token (`authorizedFetch`
returns the 401, other methods reject with `unauthorized`).

The refresh cookie is shared by every tab, and a request reads it when sent and sets it when
answered: two cookie requests in flight at once would let the older answer overwrite the newer
cookie. So every request that presents or sets it (sign-in, the provider callback, a cookie
refresh, a logout) runs under the Web Lock `identgineer-identity-cookie` (where `locks` is
available), and the page's tabs send them one at a time. A sign-out holds the lock once across
its logout, cookie lookup and the logout of what that lookup found; the lock is never held while
waiting for the operation queue. Both sides of the lock are bounded:

- A holder keeps it at most three request timeouts (45 seconds by default): enough for a
  sign-out's own logout, lookup and the logout of what it found even when each takes nearly its
  whole timeout. Then its requests are aborted, the lock is let go, and the operation says what
  it could not finish: a sign-out resolves `server-unreachable`, and a sign-in or refresh
  rejects `network`, even a sign-in cancelled while its request was in flight. Cutting off the
  logout of a session a cancelled sign-in opened changes nothing for that sign-in: it still
  rejects `unauthorized` (`unknown` once disposed).
- A request waits for the lock at most four request timeouts (one more than any holder of this
  client keeps it). Not granted by then, it fails closed: it is never sent, and rejects `network`
  (a scheduled refresh tries again with its backoff; a sign-in can be retried), and a sign-out
  resolves `server-unreachable`. A sign-in cancelled while it waits by a sign-out in this tab is
  not sent when the lock comes, and rejects `unauthorized`; `dispose()` ends a sign-in's wait at
  once, rejecting `unknown`. Every other wait outlives `dispose()`, so a sign-out under way, or
  the logout of a session a cancelled sign-in opened, still ends its session once the lock comes.

A cookie request runs without the lock only when there is no lock manager (`locks: null`, or no
`navigator.locks`) or the manager itself fails (a sandboxed frame's `SecurityError`, whose error
never reaches the caller). A cookie refresh refused with 401 is retried once, in case another tab
rotated the cookie in between without the lock. After every cookie refresh the client reads
`GET /api/users/me` with the new token: if the cookie now belongs to another user (another tab
signed in as them), this tab drops the tokens and signs out with `reason: "user-changed"`.

**CSRF.** `credentials: "include"` is used only where the cookie is needed: sign-in, refresh,
logout and the provider callback. Those requests carry `X-Requested-With: identgineer` and the
refresh-cookie header, and the writes a JSON body, so none is a CORS "simple" request: the browser
preflights it and the CMS's CORS allow-list decides. State changes are never sent as a GET, except
the two GETs users-permissions defines (`/auth/email-confirmation`, the provider callback). Every
other request omits credentials and sends the bearer token.

**Enumeration.** `register` (with email confirmation on), `requestPasswordReset` and
`resendConfirmation` resolve to the same frozen value for existing and unknown accounts. camis
answers every address alike itself with `CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE` on (its default):
registration `{email, sent: true}`, which the client reads as `check-email`. Where the backend
answers differently (that setting off, or Strapi), a taken address or username, "already
confirmed", "user blocked" and a server failure only an existing account can reach all resolve as
success too. A username that is an email address other than the one registering is refused by
camis with the setting on, and the client reports it as a `validation` error on `username`. Every
failed sign-in is `invalid-credentials`. A 415 (a body that was not JSON, which this client never
sends) is `unknown`. Without email confirmation a new account is signed in at once, so
registration cannot hide that an address was free.

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

**Sign-out.** `signOut` is the strongest operation. At once it signs out locally and cancels every
sign-in, restore and re-check asked for before it, so none of them can leave the tab signed in.
Then it ends the session on the server, waits for the work it cancelled (a sign-in or password
change; it ends any session that work opened), and only then tells the other tabs. Anything asked
for meanwhile (a sign-in, restore or re-check) waits for it to finish and then runs afresh. So a
sign-in asked for in the same tab during a sign-out, failing or not, never cuts it short: the
sign-out ends what it set out to end and tells the other tabs, and only then does the sign-in run
(and, if it succeeds, tell the other tabs of itself).

Across tabs the later action wins. Another tab's sign-in this tab hears of after the sign-out began
(by its `signed-in` notice, which a tab sends only once it holds the new session) stands, unless
that tab signed out again by the time this sign-out finishes. The sign-out then logs out no
session it finds in the cookie (it skips the lookup, or the logout after it, once it knows of the
newer sign-in), tells no tab of a sign-out, and resolves `{ outcome: "superseded" }`; the queued
re-check brings this tab to the newer session. Three things qualify that:

- A notice heard before the logout of a session the lookup found was answered may be about that
  very session, which the sign-out has then ended: it resolves `signed-out` and tells the other
  tabs. Only a notice heard after that supersedes it.
- A notice heard while the lookup was in flight means the lookup's answer may have set the cookie
  back to the session being signed out of (possible only without the lock): the sign-out still
  resolves `superseded`, but the re-check is dropped, so the tab stays signed out and never
  resumes the session it signed out of.
- When part of its server work could not be confirmed, it resolves `server-unreachable` instead,
  stays signed out (no re-check) and tells no tab, since the newer sign-in stands.

If the other tab signed out again by the time the sign-out finishes, it resolves `signed-out` and
tells the other tabs (that tab's own sign-out ended its session). Without such a sign-in it looks
up and logs out the cookie's session, and checks once more for a notice before telling the other
tabs.

What remains, by whether the cookie lock is held:

- **With Web Locks**, no tab's cookie request is in flight during another's, so no answer
  overwrites a newer cookie, and a logout never clears the cookie of a sign-in that landed while it
  was in flight. A tab that cannot get the lock in time does not send its request at all (it
  rejects `network`), and a section cut off at its bound aborts its requests before letting go;
  an aborted request may still have reached the server, as any timed-out request may. Two windows
  remain, both around another tab's notice, which travels only after the sign-in's answer:
  - a sign-in in another tab that finished just before this sign-out's cookie requests began, its
    notice not yet here, is logged out by them; that tab is then signed out by this tab's notice;
  - a sign-in in another tab that waited for this sign-out's cookie requests lands just after them.
    If this tab's notice reaches it first, the sign-in is cancelled, rejects `unauthorized`, and its
    session is ended; if it was already signed in, it is signed out locally while its session lives
    on (a reload resumes it); if its notice reaches this tab first, this sign-out resolves
    `superseded` and joins that session.
- **Without Web Locks** (older browsers, `locks: null`, a lock manager that fails, as in
  sandboxed frames), besides those:
  - a cookie request's answer can overwrite a newer cookie: another tab's refresh in flight when
    this tab signs in can put the older session back, and this tab is later signed out with
    `user-changed`; a sign-out's lookup in flight can do the same, and then, as above, the sign-out
    stays signed out while the old session may live on in the cookie;
  - another tab's sign-in that lands after the lookup, its notice not yet here, is left in place
    while the sign-out resolves `signed-out`, and that tab is signed out by this tab's notice;
  - a sign-in whose answer lands while this tab's logout is in flight can lose its new cookie: the
    backend decides to clear the cookie from the one the logout request carried (the old
    session's) and answers with a `Set-Cookie` that expires the cookie by name, which the browser
    applies to whatever cookie of that name it holds by then. That tab stays signed in until its
    next refresh is refused. The cause is in the backend (camis' strapi-php logout clears
    `strapi_up_refresh` by name); the lock closes it where Web Locks exist.

To find the sessions to end: with a token of its own, the tab logs that session out; the logout clears the refresh cookie only when the cookie named that
session, and the cookie may name another one (another tab's sign-in this tab never heard of). Page
script cannot see whether it was cleared, so the tab then refreshes from the cookie once more (one
request, refused when nothing is left) and logs out whatever session it finds; if the logout
refuses the token that lookup found (it expired or was revoked on the way), it looks up once more,
and reports `server-unreachable` if refused again. A tab without a
token (the state is `unknown`, a `restore()` is in flight, or it was already signed out, say with
`user-changed`) starts with that lookup. On a backend without sessions there is nothing to look
up.

The logout's own answer counts as follows: only a 2xx ended the session; a 404 is a backend without
sessions; a 401 means the token was already dead, so the session is over or only the refresh token
reaches it (a cookie session is found by the lookup; a body refresh token is refreshed outside the
session and that token logged out); anything else (a 429, a 5xx, a network failure) may have left
the session in place.

It resolves to `{ outcome: "signed-out" }` when every session it set out to end was ended or
clearly absent: a lookup the server refuses clearly (400, 401, 403, or 404 without sessions) means
there was none. Subject to the windows above, no session is then left for the cookie to resume.
Anything that cannot be confirmed, from a network failure or a server error to a throttled (429)
or malformed answer, resolves `{ outcome: "server-unreachable" }`: the other tabs are still told,
but a server session may live on until it expires, and a reload may resume it.

**Input.** Provider names and session and document ids are checked against strict patterns and
URL-encoded. `authorizedFetch` resolves its target first (a path beginning with `/` is joined to
`baseUrl`'s path), then refuses it unless it has `baseUrl`'s origin and lies under its path; `//`
and backslashes are refused outright, and so is an encoded slash, backslash or dot (`%2f`, `%5c`,
`%2e`, in any case) left in the resolved path, which a server or proxy could decode again. So
`/../admin` cannot climb out of a base path and the token never reaches another origin. The input
may be a string or a `URL`; anything else is a `validation` error. Every bearer request, `authorizedFetch` included, is sent with
`redirect: "error"`, so a redirect cannot carry the token elsewhere. `completeProviderSignIn` returns `returnTo` only if it is a same-origin relative
path (no `//host`, backslashes, schemes, control or separator characters, or encoded slashes).
Answers are size-limited, parsed with keys like `__proto__` refused, and shape-checked. Every
request is aborted after `requestTimeoutMs`.

## Backend configuration this client needs

[`cms/.env.example`](../../cms/.env.example) lists every strapi-php setting below with its value
and a one-line reason; copy its strapi-php section into the deployment's `.env`.

- **Sessions:** `CAMIS_JWT_MANAGEMENT=refresh` on strapi-php (`jwtManagement: 'refresh'` on
  Strapi). Without it there is no refresh, `restore()` finds no session, the session ends on
  reload and `signOut` cannot revoke the token on the server. Each token answer says how long the
  access token lives (`expiresIn`, from `CAMIS_ACCESS_TOKEN_LIFESPAN`), which the client follows.
- **Accounts:** `CAMIS_EMAIL_CONFIRMATION=true` and `CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE=true`, so
  registration and the confirmation resend answer every address alike; `CAMIS_ACCOUNT_MAIL_PER_HOUR`
  bounds the mail anyone can send an address; `CACHE_STORE` `database`, `redis` or `memcached`, so
  the throttles and that bound count atomically.
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
- Without Web Locks (older browsers, sandboxed frames) cookie requests from several tabs can be in
  flight at once: the one refresh retry covers the usual case, and the sign-out windows above
  widen.
- With Web Locks, on a network slow enough that a sign-out's cookie requests together take longer
  than three request timeouts, the sign-out reports `server-unreachable`; and a tab waits up to
  four request timeouts (a minute by default) for the lock before its sign-in or refresh rejects
  `network`.
- `signOut` costs one refresh request after the logout (or instead of it, in a tab without a
  token), to find any session the cookie still names; refreshes count against the CMS's refresh
  throttle (`CAMIS_REFRESH_THROTTLE_PER_MINUTE`, 60 a minute by default).

What strapi-php still lets a caller tell apart, by its generated DEPLOY.md, with accounts hidden
(none of it is tested here, as no test of it would be deterministic or it changes nothing the
SDK does):

- Without email confirmation a taken address or username answers Strapi's 400, since a new
  account is signed in at once. Keep confirmation on.
- A person registering with their own address learns that a username is taken from the notice
  that arrives in place of a confirmation mail; unique usernames make this inherent.
- Accounts imported from Strapi (bcryptjs cost 10) take another time to check until their first
  sign-in stores the password again at the configured cost (`BCRYPT_ROUNDS=10` closes it at once).
- Mail is sent after the answer, but only PHP-FPM and LiteSpeed finish the response first: under
  mod_php or `php artisan serve` (and so the live backend) the client waits for the mail, and its
  time shows whether one was sent.
- A new registration's insert takes a few milliseconds more; the blocked and unconfirmed errors
  come only after a correct password, as in Strapi.

Apart from that list, `SANCTUM_TOKEN_EXPIRATION` is still not read: access token lifetimes come
from `CAMIS_JWT_LIFESPAN` and `CAMIS_ACCESS_TOKEN_LIFESPAN`, and each answer's `expiresIn` says it.

## Testing

`@identgineer/identity/testing` exports `createFakeIdentityApi(options)`, an in-memory stand-in for
the endpoints above with strapi-php's behaviour (error envelope, guest routes refusing a bearer
token, refresh and legacy modes, cookie mode, a browser-like cookie jar read when each request is
sent, validation as strict as camis 19b2b1c (a field that is not a string answers a 400
`ValidationError`; sign-in, recovery and confirmation bodies are checked before their throttle
turn, and an identifier over 255 characters is refused before any turn; registration caps username
and email at 255 characters; a password is measured in bytes, at most 72), the logout ending the bearer token's own session (a token naming no session drops only
itself) and clearing the cookie only when the cookie's session ended or was already unusable, a
throttle answering `RateLimitError` per group of routes: sign-in, recovery and confirmation counted
per address and account named under a per-address ceiling (`throttlePerMinute`,
`addressThrottlePerMinute`, default 50), password reset in its own address bucket, and only failed
refreshes counted (`refreshThrottlePerMinute`, default 60), so a valid refresh is never refused;
and the refresh cookie refused with a 403 from a foreign `Origin` unless listed in
`allowedOrigins`), `createManualClock(start)` and `createMemoryLocks(options)` (an in-memory lock
manager for the `locks` option; a request for a lock from within that lock's own holder, which a
browser would leave waiting forever, throws and fails the test run, tracked with Node's
`AsyncLocalStorage`, which before Node 24 is cheap only with `--experimental-async-context-frame`
(Node 22.7 or later), as this package's tests run; `detectNested: false` turns the check off, and `onNestedRequest`
receives the error instead). Pass `api.fetch`, `api.baseUrl` and the clock to the client. The fake
issues opaque tokens by default, living 600 seconds in refresh mode and 30 days in legacy mode,
with `expiresIn` in refresh mode as camis answers (`accessTokens: "jwt"`,
`accessTokenLifetimeSeconds` and `reportExpiresIn` change that). As camis, it hides account
existence by default: with email confirmation on, every registration and confirmation resend is
answered `{email, sent: true}`, and a username naming another address is refused;
`hideAccountExistence: false` gives Strapi's disclosing answers. An auth write whose body is not
JSON is refused with 415. And
`api.holdNext(method, path)` holds the next such request until the returned function is called, to
interleave tabs and races. `api.restorableSession()` tells whether the cookie names a session a
reload could resume and `api.restorableUser()` whose it is, `api.setRefreshCookie(value)` plants a
stale or foreign one, and
`api.issueLastingToken(email)` issues an access token naming no session.
`src/invariants.test.ts` runs three tabs whose requests and lock grants arrive after random delays,
and fires sign-ins (some with a wrong password), sign-outs, restores, registrations (some of taken
names), password resets (some with a wrong code) and changes, provider sign-ins (some without the
round trip), disposes, timers, network failures, throttling and expired tokens in seeded random
orders (200 seeds of 30 steps, about 2 seconds). After each step it checks that a signed-in tab's
token is its user's, and that a signed-out tab holds no token, timer or `online` listener. It
judges each call against what happened while it ran, using which calls succeeded and who sent each
notice:

- a call that opens a session, asked for before a sign-out in the same tab, must not succeed;
- a sign-out resolves only after the calls it cancelled have settled;
- `signed-out` with a session left to resume is excused only when that session is another tab's
  cookie sign-in of the sign-out's time (the first window above) that succeeded, or that its tab
  dropped on hearing of the sign-out and whose session was then ended; and `signed-out` is wrong
  after another tab's standing `signed-in` notice reached the sign-out;
- `superseded` needs another tab's cookie sign-in that succeeded during the sign-out, and may leave
  only that sign-in's account to resume.

It samples interleavings; it does not prove their absence.

`src/camis-contract.test.ts` checks the client's routes, methods and body fields against camis'
strapi-php emitter and route golden when `CAMIS_DIR` names a camis checkout (as for
`pnpm cms:validate`); without it the checks are skipped with a note.

### Live contract

`pnpm contract:live` (from the repository root, with `CAMIS_DIR` set and PHP 8.3; Composer only
for the first run, which scaffolds the app)
generates strapi-php from `cms/`, boots it on 127.0.0.1 with the settings of
`cms/.env.example` (see [cms/README.md](../../cms/README.md#live-contract-test)) and runs the
`identity-live` Vitest project against it. The live tests (`src/live-contract/*.live.test.ts`) are
skipped unless `IDENTITY_LIVE_BACKEND` names the description the boot script writes, so
`pnpm test` and CI skip them. They run the real `createIdentityClient` through a browser-like
`fetch` (`src/live-contract/browser-fetch.ts`, test code only): a cookie jar honouring `Path`,
`Secure` (http on a loopback host counts as secure, as in Chromium and Firefox, though not in
WebKit), `HttpOnly`, `SameSite` (no Strict or Lax cookie sent to, or kept from, another site) and
`Max-Age`, cookies sent and kept only for `credentials: "include"`, the headers only a browser
sets dropped from the caller's, CORS preflights, answers CORS refuses failing as network errors,
only exposed response headers visible, and an unfollowed redirect answered as an opaque redirect
(status 0). They cover:

- `sdk.live.test.ts`: registration with and without email confirmation, sign-in and the cookie's
  attributes, the current user, restoring from the cookie in a fresh client, on the short-lived
  server (access tokens of 2 seconds) a refresh scheduled by the answer's `expiresIn` rather than
  the configured lifetime and rotating the cookie, an expired token refreshed before it is sent and
  a 401 answered by a refresh and a retry, creating and updating the profile, password change,
  forgot and reset password with the mailed code, confirmation with the mailed token, listing and
  revoking sessions, sign-out and sign-out everywhere, that a wrong password and an unknown account
  answer alike, and, against a server hiding accounts and one showing them as Strapi does, that a
  new, a registered and a taken-username registration and every resend answer alike, and how a
  username naming another address is answered;
- `protections.live.test.ts`: throttling (a 429 with `Retry-After` read through CORS becomes
  `throttled`, per name given; failed refreshes fill the refresh bucket while a good cookie still
  rotates), the refresh cookie not sent from another site (a check of the simulated browser, as
  `SameSite` is the browser's to enforce), refused (403) from an unlisted page or without the
  client's headers, logout needing the access token, CORS refusing a foreign page and allowing
  every header the SDK sends, and, below the SDK, registration of a new address, a registered one
  and a taken username answered alike in status, body and headers and within half again in time
  (the fastest of five tries each), every resend alike, an unknown account's sign-in as slow as a
  wrong password (the fastest of ten tries each, within half again), and the server showing
  accounts telling them apart;
- `fake-agreement.live.test.ts`: the same raw requests and failures sent to the real server and
  to `createFakeIdentityApi` set up alike, comparing status, error name, error fields and the body
  as the SDK's readers see it, with the values the SDK acts on (`expiresIn`, `sent`, which session
  is current), step by step, on every server but the short-lived one, a JSON body sent as
  `text/plain` and a form body (415 on both) and a body-less logout among the steps; none is an
  expected failure;
- `brand-kit-store.live.test.ts`: the brand kit store of `@identgineer/brand` sending through
  `authorizedFetch` (kept here to share this harness; the brand package does not depend on this
  one): the owner creating, listing, reading, updating and deleting a kit with its logo kept
  exactly, another user unable to read, change or delete it (404), a public kit read without
  credentials and not changeable by anyone else (404 signed in, 403 as the public role), a private
  kit in no public read, no owner shown through `populate`, and the owner set from the session
  whatever a client sends. One test, an update clearing the optional fields the kit no longer has,
  fails on camis today: strapi-php ignores a `null` in an update body, where Strapi clears the field.

The gaps the first live run found (a profile create refused on `owner`; a taken registration, a
confirmed resend and the sign-in time telling accounts apart; JSON read from `text/plain`; no
`expiresIn`) are fixed in camis and tested above as the behaviour wanted.
