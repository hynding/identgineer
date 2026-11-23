# Consent components in plain HTML

Two custom elements of `@identgineer/components` put the consent API of the tracker of
`@identgineer/tracking` on a page: `<idg-consent-banner>`, which asks once, and
`<idg-consent-preferences>`, where the visitor changes or withdraws the choice. Each element is
given the tracker's consent object as a JavaScript property, `consent`. The elements never create
a tracker, never import the tracking package and never store anything themselves: the tracker
keeps the one consent record. The page creates one tracker and passes `tracker.consent` to both
elements, so they share one state. Read [rules.md](./rules.md) for what the banner does and
does not do, and why.

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
    <link rel="stylesheet" href="/consent.css" />
    <script type="module" src="/build/identgineer.esm.js"></script>
    <script type="module" src="/tracking.js"></script>
  </head>
</html>
```

Hide the elements until they have hydrated, so a browser does not draw their slotted content
(the policy link, say) before the banner has decided whether it is shown. The rule belongs in a
stylesheet, not inline, because of the Content-Security-Policy in [rules.md](./rules.md#csp):

```css
/* consent.css */
idg-consent-banner:not(.hydrated),
idg-consent-preferences:not(.hydrated) {
  display: none;
}
```

## 2. The markup

Put the banner **last in the `<body>`** when it sits at the bottom of the window (the default),
and **first** when it sits at the top (`placement="top"`). The preferences go wherever the page
keeps its privacy settings, and a modal copy can go anywhere:

```html
<body>
  <main>
    <h1>Privacy</h1>
    <section aria-labelledby="privacy-title">
      <h2 id="privacy-title">Your privacy settings</h2>
      <idg-consent-preferences id="preferences" heading-level="3"></idg-consent-preferences>
    </section>
  </main>

  <idg-consent-preferences id="preferences-dialog" modal></idg-consent-preferences>

  <idg-consent-banner id="banner" preferences="preferences-dialog">
    <a slot="policy" href="/privacy">Privacy policy</a>
  </idg-consent-banner>
</body>
```

`preferences` names the panel that "Choose" opens: a modal one opens as a dialog, an inline one
takes focus on its heading. A panel can also be the banner's own child, `slot="preferences"`.

## 3. Hand the consent object over

```js
// tracking.js
import { createTracker } from "@identgineer/tracking";

const tracker = createTracker({
  endpoint: "https://collect.example.com/v1/events",
  writeKey: "wk_0123456789abcdef",
  consentVersion: 1,
  autoPageViews: true,
  events: { signup_completed: { properties: { plan: "string" } } },
});

await Promise.all(
  ["idg-consent-banner", "idg-consent-preferences"].map((tag) => customElements.whenDefined(tag)),
);
for (const element of document.querySelectorAll("idg-consent-banner, idg-consent-preferences")) {
  element.consent = tracker.consent;
}
```

An element given no consent object draws nothing and logs nothing. A consent object assigned
later, or swapped for another, is picked up, and the old one is let go; so is every object when
the element leaves the page, and an element moved in the page subscribes once, not twice. When
the object's methods throw, or `grant()` and `deny()` answer `false` because the browser will
not store, the element says so in an inline alert and never throws.

The tracking package is TypeScript source with `.ts` import specifiers, so a bundler (Vite,
esbuild, webpack with a TypeScript loader) has to compile it for the browser. The components
never load it themselves: their `consent` property is typed by a small structural interface,
`ConsentClient`, which the tracker's consent object satisfies.

## 4. Events

Every event bubbles out of the shadow root and has `composed: true`.

| Element                   | Event              | Detail                                                       |
| ------------------------- | ------------------ | ------------------------------------------------------------ |
| `idg-consent-banner`      | `idgConsentChange` | `{ state }`: `granted` or `denied`, after a choice made here |
| `idg-consent-banner`      | `idgConsentChoose` | none; cancelable, so a page can open its own preferences     |
| `idg-consent-preferences` | `idgConsentChange` | `{ state }` after "Save preferences" or an erase             |

The events say what the visitor did **here**. A change made in another tab, or by the other
element, is not repeated by them: subscribe to the tracker for every change, wherever it came from.

```js
tracker.consent.onChange((status) => {
  // { state: "granted" | "denied" | "unknown", reason?: "gpc" | "dnt" }
  console.debug("consent is now", status.state, status.reason ?? "");
});

document.getElementById("banner").addEventListener("idgConsentChange", (event) => {
  console.debug("the visitor chose", event.detail.state);
});
```

## 5. Methods and properties

| Element                   | Member                 | What it does                                                                                   |
| ------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `idg-consent-banner`      | `placement`            | `bottom` (default, sticks), `top` or `inline` (in the flow)                                    |
| `idg-consent-banner`      | `announce-signal`      | Under GPC or DNT, say in one line that it is respected                                         |
| `idg-consent-banner`      | `preferences`          | The id of the panel "Choose" opens                                                             |
| `idg-consent-preferences` | `modal`                | Draw the panel in an `idg-dialog`                                                              |
| `idg-consent-preferences` | `heading-level`        | 2 to 6, to fit the page's outline                                                              |
| `idg-consent-preferences` | `open()` and `close()` | Open and close the dialog (`open()` says whether it did); inline, `open()` focuses the heading |

A page that already has a button for the privacy settings opens the dialog itself:

```js
document.getElementById("privacy-settings").addEventListener("click", () => {
  void document.getElementById("preferences-dialog").open();
});
```

## 6. Text

Both elements take a `labels` property with every string they show, English by default. A
partial object is merged over the defaults, so only the strings you give change. Assign a new
object to change them again. See [rules.md](./rules.md#localisation).

```js
document.getElementById("banner").labels = {
  accept: "Analyse zulassen",
  decline: "Ablehnen",
  choose: "Auswählen",
  regionName: "Analyse-Auswahl",
};
```
