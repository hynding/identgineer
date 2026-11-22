# Identity components: security notes

What the identity elements of `@identgineer/components` do and do not do for a page's security.
The client they are given, `@identgineer/identity`, is described in
[its README](../../packages/identity/README.md). The framework guides are
[plain HTML](./plain-html.md), [React](./react.md), [Vue](./vue.md) and [Angular](./angular.md).

## The session guard is not access control

`<idg-session-guard>` draws its default slot only while the client is signed in. It shows the
`fallback` slot while signed out and the `pending` slot while the state is unknown. That is a
convenience for the interface and **not access control**:

- Its children are in the page's DOM all along, in the light tree, whatever the guard shows. Any
  script, extension or view-source reads them, and so does anyone with the browser's tools open.
- Hiding is done in the browser, by code the visitor controls.

Every protected resource must be refused by the server to a request without a valid token. The
CMS's permissions do that for its own API. Put nothing in a guarded slot that the visitor may not
see: render it only after the server has answered an authorized request, as `<idg-profile>` does
with the owner's profile.

The guard never shows protected content before it knows: unknown is `pending`, and a sign-out,
including one in another tab, takes the content away at once. Before it hydrates, the page has to
hide it: see [Before hydration](#before-hydration).

## Tokens and credentials

- **Tokens stay in memory** in the identity client. The access token is held in a JavaScript
  variable, and the refresh token is an `HttpOnly` cookie on backends that set one. The elements
  never see a token: they call the client's methods.
- **Nothing is stored in the browser.** No element writes to `localStorage`, `sessionStorage`,
  `document.cookie` or IndexedDB. A browser test signs in, saves the profile and signs out with
  each of them watched, and finds no write.
- **Passwords** live only in the native `<input>` the user types them into. The elements keep no
  copy in their own state: they read the input at submit. The input is emptied once the server has
  accepted or refused the password, and when the element leaves the page. After a failure in which
  the server never judged it (`network`, `throttled`), it stays in the input so the user can try
  again. A password is never written to an attribute, a text node or an event's detail, which a
  browser test checks across the whole page.
- **Events** carry `{ id, username }` for a user and outcomes, never a password, a token or an email
  address.

## Account enumeration

The elements give no hint about whether an account exists:

- A failed sign-in shows one message for a wrong password, an unknown account and a blocked one:
  the client reports them all as `invalid-credentials`. `email-not-confirmed` has a message of its
  own because the user can act on it. When the CMS sends it is the CMS's decision.
- Registration with an address or username already taken shows the same confirmation, in the same
  markup and accessibility tree, as a new account waiting for its email. This holds when the CMS
  confirms addresses. Without confirmation, a new account is signed in at once, which tells the two
  apart; turn email confirmation on where enumeration matters.
- A password reset request shows the same confirmation for every address.

Browser tests compare the rendered markup and the accessibility tree of both cases, character for
character. When you translate the text with `labels`, keep each message fixed and generic: do not
put the address, the account's name or a reason into a message.

## Throttling and errors

Messages are fixed per error code. The server's own text is never shown, because it could name a
field, an account or an internal detail. `throttled` shows the wait the client reports as a
countdown, announced politely when it starts and when it is over, not every second. `network`
offers a retry. A sign-out the server could not confirm (`server-unreachable`) is told plainly,
since the session may stay active on the server until it expires.

## Labels

`labels` replaces visible text only. It is set as text, never parsed as HTML, so a translation
cannot inject markup. `{name}` and the other placeholders are filled with text, too.

## Password managers and autofill

The forms set `autocomplete` on the real inputs: `username webauthn` and `current-password` to sign
in, `username`, `email` and `new-password` to register, `one-time-code` for a reset code, and
`new-password` twice to choose a password. They also set `autocapitalize="none"` and
`spellcheck="false"`. The profile's password change has a hidden `username` field, so a manager
updates the right entry. The inputs are inside shadow roots, and managers differ in how well they
reach them: see the `idg-input` notes in the
[components README](../../packages/components/README.md#idg-input).

## Content-Security-Policy

The elements run under
`default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'`.
Every browser test runs under that policy and fails on any violation. The elements use no inline
script or style, no `eval`, and no `innerHTML`. A provider sign-in sends the browser to the address
`providerSignInUrl()` built, with `location.assign`, after a cancelable `idgProviderSignIn` event.
Allow the CMS's origin in `connect-src` for the client's requests.

## Before hydration

Until an element hydrates, a browser draws its light-DOM children as ordinary content. For the
guard, those children are the protected content. Hide the identity elements until they hydrate,
with a rule in a stylesheet (inline style is refused by the policy above):

```css
idg-sign-in:not(.hydrated),
idg-register:not(.hydrated),
idg-password-reset:not(.hydrated),
idg-profile:not(.hydrated),
idg-user-menu:not(.hydrated),
idg-session-guard:not(.hydrated) {
  display: none;
}
```
