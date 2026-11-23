# Dashboard components: what they do and what the source must do

The dashboard elements (`idg-property-picker`, `idg-stat`, `idg-sparkline`, `idg-event-table`) are
presentational. They hold no secret, make no request and keep nothing between page loads. Two
things follow, and this page is about both: the **source** that feeds them has to enforce who may
see what, and the elements have to treat every string they are given as **untrusted text**. This is
not legal advice about what may be collected or shown.

## Ownership is the source's to enforce

The elements cannot know who the user is, and nothing a browser does can make a request safe: a
page's JavaScript can ask for any property id. The `DashboardSource` that the server task
implements over the authenticated API therefore enforces ownership, on the server, on every call:

- Every call is made as the signed-in user, with the session the API already trusts. An
  unauthenticated call rejects with `unauthenticated`.
- `listProperties()` answers only the properties the user owns.
- `listEvents(propertyId, ...)` and `summary(propertyId, ...)` for a property the user does not own
  reject exactly as they do for one that does not exist: the same `DashboardError` code
  (`not-found`), the same message, the same timing as far as the server can make it. A different
  answer tells a stranger which ids exist.
- A response carries no more than the contract says. `validatedSource` parses every answer with
  the same parsers the package exports and rejects a malformed one with `invalid-response`, so a
  server that sends a hundred thousand events, an event with a `javascript:` URL as its name or
  an answer for another property is stopped before an element sees it.
- Requests are checked too: a page below 1, a page size above 100 or a sort key that is not
  `time` or `name` rejects with `invalid-request` and the source is never asked.
- A `DashboardError` the source throws passes through as it was, so its code and its message are
  the source's to choose: write messages that are safe to log. Any other failure (a network error,
  a bug) is turned into `unavailable` with no message of the original, so a stack trace or a
  server's address is not carried on. Neither is for the page to print: show a sentence of your
  own and send the code to the console.
- A request that is not even an object (no query, a null query, a null sort) rejects with
  `invalid-request` as a rejection, never as a thrown error.
- `total` is clamped to ten million and dates must be real: a time with a day the month lacks or
  an hour of 24 is dropped, as is one with no zone.

The fake source in the package's `src/testing` enforces the same rule (an id that is not among its
properties rejects with an identical `not-found`) so tests can exercise the denied path, not only
the allowed one.

## Untrusted text

Event names, paths, property names and values, and a property's name and origin are text that
people typed or that a page on the public internet sent. The elements:

- draw it as text only, through the framework's text nodes. Nothing is written with `innerHTML`,
  no value becomes an `href`, `src` or inline style, and a path such as `javascript:alert(1)` is
  shown as the characters it is and is never a link;
- replace every control character, bidirectional control, zero width and invisible format
  character and lone surrogate with a visible mark (U+FFFD), one for one, so
  that an event named `pay<RLO>fdp.exe` does not draw as `payexe.pdf` and a reader can see that
  something was there;
- isolate each value in a `<bdi>`, so right to left text cannot reorder what is next to it;
- cut a value at a fixed length, by code point, with an ellipsis, and count the properties beyond
  the first ten as "+N more", so no record makes a row taller or wider than a page can hold;
- break a long word where it has to, in its cell, so a cell never widens the page; a table wider
  than its frame scrolls inside the frame, which can take keyboard focus;
- say the same thing to a screen reader as to the eye: the trimmed text, not the original.

`<script>` in a name is therefore a name with the characters `<script>` in it. A picker's options
are text too: the name is shortened and neutralised, and the origin is shown as a host.

## CSP

The elements work under a strict Content-Security-Policy. They need no `unsafe-inline` and no `unsafe-eval`, and run under
`default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'`.
They set no inline style and no inline script, and create no URL from data. A page's own
stylesheet and module are served from its own origin.

## No browser storage

The elements write nothing to cookies, `localStorage`, `sessionStorage` or IndexedDB. The picker
is form-associated and submits its chosen id under its `name` as any select does; nothing else
leaves the page.

## Requests and races

A page that asks the source on every choice, page and sort must drop an answer that arrives after
a newer request was made (a counter, as the guides do), or the table shows the events of a
property the picker no longer shows. While a request is out, set `loading`; when it fails, set
`error` to a sentence for people, and write the reason to the console, never to the page.
`idg-event-table` shows `error` in a quiet alert inside its status region.

## Accessibility

- The table is a real `<table>` with a caption, column headers and a row header for the event name.
  A sortable header is a button with `aria-sort` on its cell, and a sort is announced politely.
- A change of page or a load is announced politely in one region: "Showing 11–20 of 95 events".
- A stat's change is said in words ("Increased by 12%, vs the 7 days before") as well as drawn
  with an arrow, so colour is never the only signal.
- A sparkline is one image with a name and a sentence of its own (first, last, lowest, highest and
  the trend); its marks are hidden from assistive technology. It never animates, so reduced motion
  needs no exception.
- The elements keep working at 320px wide with the text doubled, in right to left text, in forced
  colours and under every theme, design, layout and UX mode of the variation system.

## Localisation

Every string the elements show comes from a `labels` property, English by default. A partial object
is merged over the defaults, so only the strings you give change. The strings with placeholders
(`{from}`, `{to}`, `{total}`, `{count}`, `{page}`, `{column}`, `{direction}`, `{label}`,
`{summary}`, `{first}`, `{last}`, `{lowest}`, `{highest}`, `{trend}`, `{value}`) keep them. Times
and numbers follow the `lang` of the page (or of the nearest ancestor with one) through `Intl`,
and the time column uses `timeZone`, an IANA zone, or else the viewer's own.

```ts
import type {
  EventTableLabels,
  PropertyPickerLabels,
  SparklineLabels,
} from "@identgineer/components";

const EVENTS: Partial<EventTableLabels> = {
  columnName: "Ereignis",
  columnTime: "Zeit",
  empty: "Noch keine Ereignisse.",
  summary: "{from}–{to} von {total} Ereignissen",
};

const PICKER: Partial<PropertyPickerLabels> = {
  label: "Website",
  placeholder: "Website wählen",
};

const SPARKLINE: Partial<SparklineLabels> = {
  rising: "steigend",
  falling: "fallend",
  steady: "gleichbleibend",
};
```
