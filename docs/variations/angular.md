# Variations in Angular

Angular needs nothing special: the variations are attributes on `<html>`, and
`@identgineer/variations` is a small framework-free runtime. Framework wrappers do not exist yet, so
this guide uses only what exists today: the attributes, the runtime and the
`<idg-variation-switcher>` custom element. The examples use standalone components and signals.

## 1. Attributes and the bootstrap script

The attributes are the real interface: `<html lang="en" data-theme="ember" data-design="glass"
data-layout="bento" data-ux="focus" data-scheme="dark">` in `src/index.html` is a complete choice, and
an absent attribute means the default.

Put the bootstrap script first in the head of `src/index.html` (blocking, same origin, with its
integrity; see [plain-html.md](./plain-html.md)) and load the tokens. Copy `dist/bootstrap.js` of the
built variations package, and the tokens' `dist/`, into `public/` (or list them as `assets` in
`angular.json`).

```html
<head>
  <script src="/variations/bootstrap.js" integrity="sha384-COPY-FROM-bootstrap.sri.json"></script>
  <link rel="stylesheet" href="/tokens/index.css" />
</head>
```

## 2. A service for the state

`onVariationsChange` hears every change, whoever makes it. Subscribe in the browser only, and
unsubscribe when the service is destroyed.

```ts
// variations.service.ts
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  applyVariations,
  getVariations,
  onVariationsChange,
  resetVariations,
  shuffleVariations,
  type VariationState,
} from "@identgineer/variations";

@Injectable({ providedIn: "root" })
export class VariationsService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly current = signal<VariationState>(getVariations());

  /** The state of the page. On the server there is no document, so it is the defaults. */
  readonly state = this.current.asReadonly();

  constructor() {
    if (!this.browser) return;
    this.current.set(getVariations());
    const stop = onVariationsChange(({ state }) => {
      this.current.set(state);
    });
    inject(DestroyRef).onDestroy(stop);
  }

  apply(partial: Partial<VariationState>): void {
    if (this.browser) applyVariations(partial, { persist: true });
  }

  shuffle(): void {
    if (this.browser) applyVariations(shuffleVariations(), { persist: true });
  }

  reset(): void {
    if (this.browser) resetVariations({ persist: true });
  }
}
```

`applyVariations` validates everything and never throws, so a value from a `<select>` can be passed
as it is.

```ts
// theme-picker.component.ts
import { Component, inject } from "@angular/core";
import { REGISTRY, type VariationState } from "@identgineer/variations";
import { VariationsService } from "./variations.service";

@Component({
  selector: "app-theme-picker",
  standalone: true,
  template: `
    <label>
      Theme
      <select [value]="variations.state().theme" (change)="choose($event)">
        @for (theme of themes; track theme.id) {
          <option [value]="theme.id">{{ theme.label }}</option>
        }
      </select>
    </label>
  `,
})
export class ThemePickerComponent {
  protected readonly variations = inject(VariationsService);
  protected readonly themes = REGISTRY.theme.variations;

  protected choose(event: Event): void {
    const theme = (event.target as HTMLSelectElement).value as VariationState["theme"];
    this.variations.apply({ theme });
  }
}
```

## 3. The switcher as a custom element

Register the components once, in the browser, before the app starts. Then allow unknown `idg-`
elements in the components that use them with `CUSTOM_ELEMENTS_SCHEMA`.

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { defineCustomElements } from "@identgineer/components/loader";
import { AppComponent } from "./app/app.component";

void defineCustomElements();
bootstrapApplication(AppComponent);
```

```ts
// appearance.component.ts
import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core";
import type { VariationsChangeDetail } from "@identgineer/components";

@Component({
  selector: "app-appearance",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <idg-variation-switcher
      heading="Appearance"
      axes="theme,design,scheme"
      orientation="inline"
      persist
      (idgVariationsChange)="changed($event)"
    ></idg-variation-switcher>
  `,
})
export class AppearanceComponent {
  protected changed(event: Event): void {
    const { state, changed } = (event as CustomEvent<VariationsChangeDetail>).detail;
    console.log(changed, state);
  }
}
```

`(idgVariationsChange)` adds a listener for exactly that event name. Plain attributes such as
`persist` and `axes` are set as attributes, which the element reads; to bind a value, use
`[attr.axes]="expression"`. The event fires only for a change the visitor makes through the panel;
to follow every change, read `VariationsService.state`.

## 4. Server rendering (Angular SSR)

The runtime touches no DOM when imported, so it is safe in server code, but its event channel needs
a browser (`MutationObserver`), which is why the service above only subscribes in the browser. Two
ways to avoid the wrong first paint.

**Leave it to the bootstrap script.** The script tag in `index.html` is part of the server's HTML.
The server renders the defaults, the script (which blocks painting) applies the stored choice or a
shared link before anything is drawn, and the app hydrates over attributes that are already right.
Hydration does not touch attributes on `<html>`.

**Render the attributes on the server from a cookie.** The runtime stores a choice in
`localStorage`, which a server cannot read, so keep a cookie too. Everything read from it goes
through `decodeVariations`, which keeps only registry ids. On the server, set the attributes with the
renderer rather than with `applyVariations`, which announces a change to listeners in a browser
document.

```ts
// variations-cookie.ts
import { DOCUMENT } from "@angular/common";
import {
  PLATFORM_ID,
  REQUEST,
  inject,
  provideAppInitializer,
  RendererFactory2,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { decodeVariations, encodeVariations, onVariationsChange } from "@identgineer/variations";

const COOKIE = "idg-variations";

function cookieValue(header: string): string {
  const entry = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  try {
    return decodeURIComponent(entry?.slice(COOKIE.length + 1) ?? "");
  } catch {
    return "";
  }
}

export const provideVariationsCookie = () =>
  provideAppInitializer(() => {
    const document = inject(DOCUMENT);
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      onVariationsChange(({ state }) => {
        document.cookie = `${COOKIE}=${encodeURIComponent(encodeVariations(state))}; path=/; max-age=31536000; samesite=lax`;
      });
      return;
    }
    // REQUEST is the incoming request in Angular 20 and later; older versions provide it from
    // @angular/ssr/tokens.
    const header = inject(REQUEST, { optional: true })?.headers.get("cookie") ?? "";
    const choice = decodeVariations(new URLSearchParams(cookieValue(header)));
    const renderer = inject(RendererFactory2).createRenderer(null, null);
    for (const [axis, value] of Object.entries(choice)) {
      if (axis === "scheme" && value === "system") continue;
      renderer.setAttribute(document.documentElement, `data-${axis}`, value);
    }
  });
```

Add `provideVariationsCookie()` to the providers of `app.config.ts`, and keep the bootstrap script as
well: it also applies a link someone shared. A cookie is sent with every request and needs a consent
decision where the law asks for one.
