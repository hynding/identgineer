# Identity components in Angular

The identity elements are custom elements that take the identity client as a JavaScript property,
`client`. Angular binds `[client]="client"` as a property of the element, which is what it needs.
Create one client for the app and read [security.md](./security.md) before going live.
`<idg-session-guard>` is a convenience for the interface and **not access control**.

## 1. One client and the components

Provide the client once, in the browser only:

```ts
// identity.ts
import { InjectionToken } from "@angular/core";
import { createIdentityClient, type IdentityClient } from "@identgineer/identity";

export const IDENTITY_CLIENT = new InjectionToken<IdentityClient>("identity client", {
  providedIn: "root",
  factory: () => createIdentityClient({ baseUrl: "https://cms.example.com" }),
});
```

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { defineCustomElements } from "@identgineer/components/loader";
import { AppComponent } from "./app/app.component";

void defineCustomElements();
bootstrapApplication(AppComponent);
```

Load `/tokens/index.css`, and put the pre-hydration rule from
[plain-html.md](./plain-html.md#1-load-the-tokens-and-the-components) in a global stylesheet.

## 2. Components

Allow the `idg-` elements with `CUSTOM_ELEMENTS_SCHEMA`. A property binding set before the element
is defined is kept as an own property, and the element takes it up when it upgrades.

```ts
// sign-in-page.component.ts
import { CUSTOM_ELEMENTS_SCHEMA, Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import type { SignedInDetail, SignInProvider } from "@identgineer/components";
import { IDENTITY_CLIENT } from "./identity";

@Component({
  selector: "app-sign-in-page",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <idg-sign-in [client]="client" [providers]="providers" (idgSignedIn)="signedIn($event)">
      <a slot="reset" href="/reset">Forgot your password?</a>
    </idg-sign-in>
  `,
})
export class SignInPageComponent {
  protected readonly client = inject(IDENTITY_CLIENT);
  protected readonly providers: SignInProvider[] = [{ name: "github", label: "GitHub" }];
  private readonly router = inject(Router);

  protected signedIn(event: Event): void {
    const { user } = (event as CustomEvent<SignedInDetail>).detail;
    void this.router.navigate(["/account"], { state: { username: user.username } });
  }
}
```

```ts
// account-page.component.ts
import { CUSTOM_ELEMENTS_SCHEMA, Component, inject } from "@angular/core";
import type { SessionChangeDetail, SignedOutDetail } from "@identgineer/components";
import { IDENTITY_CLIENT } from "./identity";

@Component({
  selector: "app-account-page",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <idg-user-menu [client]="client" (idgSignedOut)="signedOut($event)">
      <a slot="signed-out" href="/sign-in">Sign in</a>
    </idg-user-menu>
    <idg-session-guard [client]="client" (idgSessionChange)="changed($event)">
      <idg-profile [client]="client"></idg-profile>
      <p slot="fallback"><a href="/sign-in">Sign in</a> to see your account.</p>
    </idg-session-guard>
  `,
})
export class AccountPageComponent {
  protected readonly client = inject(IDENTITY_CLIENT);

  protected changed(event: Event): void {
    console.debug((event as CustomEvent<SessionChangeDetail>).detail.status);
  }

  protected signedOut(event: Event): void {
    if ((event as CustomEvent<SignedOutDetail>).detail.outcome !== "superseded") {
      location.assign("/");
    }
  }
}
```

`(idgSignedIn)` adds a listener for exactly that event name. For the reset page, bind the code
from the route: `<idg-password-reset mode="complete" [code]="code" [client]="client">`.

## 3. Text

`labels` is a property: `[labels]="labels"`, with a partial object of strings merged over the
English defaults. Keep it in a field, so the binding changes only when the text does.

## 4. Server rendering (Angular SSR)

The elements draw nothing on the server and the client needs a browser. Call
`defineCustomElements()` in the browser only. The token's factory runs wherever the token is
injected, so under SSR inject it only in the browser (`isPlatformBrowser`, or in
`afterNextRender`). Until then the bare tags are in the server's HTML, kept out of sight by the
pre-hydration rule.
