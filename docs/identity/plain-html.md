# Identity components in plain HTML

Six custom elements of `@identgineer/components` put the identity client of
`@identgineer/identity` on a page: `<idg-sign-in>`, `<idg-register>`, `<idg-password-reset>`,
`<idg-profile>`, `<idg-session-guard>` and `<idg-user-menu>`. Each element is given the client as
a JavaScript property, `client`. The elements never create a client, never import the identity
package and never store anything. The page creates one client and passes it to every element, so
they all share one state. Read [security.md](./security.md) before going live:
`<idg-session-guard>` is a convenience for the interface and **not access control**.

## 1. Load the tokens and the components

The components are styled by the design tokens and loaded by the lazy loader of the built package
(`dist/identgineer/identgineer.esm.js`, served here as `/build/identgineer.esm.js`). The page's
own module comes after it:

```html
<!doctype html>
<html lang="en" data-theme="aurora" data-design="flat" data-layout="top-bar" data-ux="comfortable">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/tokens/index.css" />
    <link rel="stylesheet" href="/identity.css" />
    <script type="module" src="/build/identgineer.esm.js"></script>
    <script type="module" src="/identity.js"></script>
  </head>
</html>
```

Hide the elements until they have hydrated. Otherwise a browser draws the guard's children before
the guard has decided whether they may be seen. The rule belongs in a stylesheet, not inline,
because of the [Content-Security-Policy](./security.md#content-security-policy):

```css
/* identity.css */
idg-sign-in:not(.hydrated),
idg-register:not(.hydrated),
idg-password-reset:not(.hydrated),
idg-profile:not(.hydrated),
idg-user-menu:not(.hydrated),
idg-session-guard:not(.hydrated) {
  display: none;
}
```

## 2. The markup

```html
<header>
  <idg-user-menu id="menu">
    <idg-menu-item slot="items" value="profile">Your profile</idg-menu-item>
    <a slot="signed-out" href="/sign-in">Sign in</a>
  </idg-user-menu>
</header>

<main>
  <idg-session-guard id="guard">
    <idg-sign-in id="sign-in" slot="fallback">
      <a slot="reset" href="/reset">Forgot your password?</a>
      <p slot="register">New here? <a href="/register">Create an account</a></p>
    </idg-sign-in>
    <idg-skeleton slot="pending" lines="3"></idg-skeleton>
    <idg-profile id="profile"></idg-profile>
  </idg-session-guard>
</main>
```

On other pages:

```html
<idg-register id="register">
  <p slot="sign-in">Have an account? <a href="/sign-in">Sign in</a></p>
</idg-register>

<!-- /reset: asks for the link -->
<idg-password-reset mode="request"></idg-password-reset>

<!-- /reset/complete?code=…: sets the new password -->
<idg-password-reset id="reset" mode="complete"></idg-password-reset>
```

## 3. Hand the client over

```js
// identity.js
import { createIdentityClient } from "@identgineer/identity";

const client = createIdentityClient({ baseUrl: "https://cms.example.com" });

const tags = ["idg-sign-in", "idg-register", "idg-password-reset", "idg-profile"];
await Promise.all(
  [...tags, "idg-session-guard", "idg-user-menu"].map((tag) => customElements.whenDefined(tag)),
);
for (const element of document.querySelectorAll(
  "idg-sign-in, idg-register, idg-password-reset, idg-profile, idg-session-guard, idg-user-menu",
)) {
  element.client = client;
}

// The reset code comes from the link in the email; the element never reads the address bar.
const reset = document.getElementById("reset");
if (reset) reset.code = new URLSearchParams(location.search).get("code") ?? undefined;
```

An element given no client draws nothing that needs one. `idg-session-guard` and
`idg-user-menu` restore the session once (`client.restore()`) if nobody has done so yet. When
that cannot reach the server, the guard shows a notice with "Try again", and both try again when
the browser is back online. A client
assigned later, or swapped for another, is picked up, and the old one is let go.

The identity package is TypeScript source with `.ts` import specifiers, so a bundler (Vite,
esbuild, webpack with a TypeScript loader) has to compile it for the browser. The components never
load it themselves.

## 4. Events

Every event bubbles out of the shadow root and has `composed: true`. No event detail carries a
password, a token or an email address.

| Element              | Event                | Detail                                                          |
| -------------------- | -------------------- | --------------------------------------------------------------- |
| `idg-sign-in`        | `idgSignedIn`        | `{ user: { id, username } }`                                    |
| `idg-sign-in`        | `idgProviderSignIn`  | `{ provider, url }`; cancelable                                 |
| `idg-register`       | `idgRegistered`      | `{ outcome: "check-email" }` or `signed-in` with `user`         |
| `idg-password-reset` | `idgResetRequested`  | none                                                            |
| `idg-password-reset` | `idgPasswordReset`   | `{ user }`                                                      |
| `idg-profile`        | `idgProfileSaved`    | `{ profile }`                                                   |
| `idg-profile`        | `idgPasswordChanged` | none                                                            |
| `idg-profile`        | `idgSessionRevoked`  | `{ id }`                                                        |
| `idg-profile`        | `idgSignedOut`       | `{ outcome, everywhere: true }` after "Sign out everywhere"     |
| `idg-session-guard`  | `idgSessionChange`   | `{ status }`, with `reason` when signed out; or `unreachable`   |
| `idg-user-menu`      | `idgSignedOut`       | `{ outcome }`: `signed-out`, `server-unreachable`, `superseded` |

A sign-out the server could not confirm (`outcome: "server-unreachable"`) leaves the session
alive on the server, and the user must be told. `idg-user-menu` says so beside its trigger, and
`idg-session-guard` says so above its fallback for a sign-out from the content it guards, such as
`idg-profile`'s "Sign out everywhere", which is gone by then. A page that signs out some other way,
or navigates away at once, tells the user itself:

```js
document.addEventListener("idgSignedOut", (event) => {
  // Carry the warning to the next page, which shows it.
  const warning = event.detail.outcome === "server-unreachable" ? "?unconfirmed" : "";
  location.assign(`/${warning}`);
});
```

Moving to another page is the page's job:

```js
document.getElementById("sign-in").addEventListener("idgSignedIn", () => {
  location.assign("/account");
});

document.getElementById("menu").addEventListener("idgSelect", (event) => {
  if (event.detail.value === "profile") location.assign("/account");
});
```

## 5. Provider sign-in

Give `<idg-sign-in>` the providers the CMS has enabled. A provider button fires
`idgProviderSignIn` with the address from `client.providerSignInUrl()`. Unless a listener calls
`preventDefault()`, the element then goes there with `location.assign`. Use `providerCallback` for
the address the CMS sends the browser back to.

```js
const signIn = document.getElementById("sign-in");
signIn.providers = [{ name: "github", label: "GitHub" }];
signIn.providerCallback = "https://app.example.com/auth/github/callback";
```

## 6. Text

Every element takes a `labels` property with English defaults. A partial object is merged over
them, so only the strings you give change. Assign a new object to change them again.
`{name}`, `{time}`, `{used}` and `{max}` are filled in where the default has them.

```js
document.getElementById("sign-in").labels = {
  submit: "Anmelden",
  errorInvalidCredentials: "E-Mail, Benutzername oder Passwort sind nicht korrekt.",
};
```

Write the error messages as fixed, generic sentences. See [security.md](./security.md#account-enumeration).
