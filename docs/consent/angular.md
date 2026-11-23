# Consent components in Angular

The consent elements are custom elements that take the tracker's consent object as a JavaScript
property, `consent`. Angular binds `[consent]="tracker.consent"` as a property of the element,
which is what it needs. Create one tracker for the app and read [rules.md](./rules.md) for what
the banner does and why.

## 1. One tracker and the components

Provide the tracker once, in the browser only:

```ts
// tracking.ts
import { InjectionToken } from "@angular/core";
import { createTracker, type Tracker } from "@identgineer/tracking";

export const TRACKER = new InjectionToken<Tracker>("tracker", {
  providedIn: "root",
  factory: () =>
    createTracker({
      endpoint: "https://collect.example.com/v1/events",
      writeKey: "wk_0123456789abcdef",
      consentVersion: 1,
      autoPageViews: true,
      events: { signup_completed: { properties: { plan: "string" } } },
    }),
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

## 2. The banner and the preferences

Allow the `idg-` elements with `CUSTOM_ELEMENTS_SCHEMA`. A property binding set before the element
is defined is kept as an own property, and the element takes it up when it upgrades. Put the
banner **last** in the root component's template, outside any element with `overflow` (see
[placement](./rules.md#placement-and-space)).

```ts
// app.component.ts
import { CUSTOM_ELEMENTS_SCHEMA, Component, inject } from "@angular/core";
import type { ConsentChangeDetail } from "@identgineer/components";
import { TRACKER } from "./tracking";

@Component({
  selector: "app-root",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <main>
      <h1>Privacy</h1>
      <idg-consent-preferences [consent]="consent" [headingLevel]="3"></idg-consent-preferences>
      <button type="button" (click)="openDialog(dialog)">Open the settings in a dialog</button>
    </main>

    <idg-consent-preferences
      #dialog
      id="preferences-dialog"
      [consent]="consent"
      modal
    ></idg-consent-preferences>

    <idg-consent-banner
      [consent]="consent"
      preferences="preferences-dialog"
      (idgConsentChange)="chose($event)"
    >
      <a slot="policy" href="/privacy">Privacy policy</a>
    </idg-consent-banner>
  `,
})
export class AppComponent {
  protected readonly consent = inject(TRACKER).consent;

  protected chose(event: Event): void {
    const { state } = (event as CustomEvent<ConsentChangeDetail>).detail;
    console.debug("the visitor chose", state);
  }

  protected openDialog(dialog: HTMLElement & { open: () => Promise<boolean> }): void {
    void dialog.open();
  }
}
```

For every change, wherever it came from, subscribe to the tracker: `inject(TRACKER).consent.onChange(...)`
returns the function that unsubscribes, which a component calls in `ngOnDestroy`.

## 3. Text

`labels` is a property too. Pass a partial object of strings, which is merged over the English
defaults. Keep the object in a field so the same one is passed on every change detection:

```ts
protected readonly labels = { accept: "Analyse zulassen", decline: "Ablehnen", choose: "Auswählen" };
```

```html
<idg-consent-banner [consent]="consent" [labels]="labels"></idg-consent-banner>
```

## 4. Server rendering

The elements draw nothing on the server, and the tracker records nothing there. Create the
tracker and call `defineCustomElements()` in the browser only (behind `isPlatformBrowser`). The
server's HTML then has the bare tags, which the pre-hydration rule keeps out of sight until they
hydrate.
