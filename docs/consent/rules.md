# What the consent banner does, and why

The two consent elements, `<idg-consent-banner>` and `<idg-consent-preferences>`, are built so that
the easy thing to ship is also the fair one. This page lists the rules they follow, how to place
the banner so it never gets in the way, how to translate every word of it, and what they leave to
you. The wiring is in [plain HTML](./plain-html.md), [React](./react.md), [Vue](./vue.md) and
[Angular](./angular.md).

## The rules

1. **No dark patterns.** "Decline" and "Accept analytics" have the same variant, the same size and
   the same look, within a pixel in every design, theme and text size (a browser test holds this
   to numbers). Decline comes first, in the page and in the Tab order. Nothing is pre-ticked, there
   is no "X" that counts as consent, and the words do not shame the visitor for declining.
2. **Ignoring it is not consent.** Escape does nothing to it, and scrolling, clicking on the page
   or leaving it unanswered leaves the state `unknown`, in which the tracker sends and stores
   nothing.
3. **Privacy signals are respected without asking.** While Global Privacy Control or Do Not Track
   is set, the tracker's consent is `denied` whatever was stored, and the banner does not ask at
   all: asking would invite a choice the browser has already made. It draws nothing, or, with the
   attribute `announce-signal`, one polite line that the signal is respected and analytics are
   off. The preferences show the switch off and disabled, name the signal, and cannot grant.
4. **It never blocks the page.** The banner is a `region` with an accessible name, not a dialog:
   nothing behind it is inert, focus is not trapped, and it takes no focus when it appears. Its
   height is limited to half the window, so on a small screen with large text it scrolls inside
   itself and the page behind stays readable. In a window too short for both (under 32rem tall),
   a bottom banner leaves its place on the screen and joins the page's flow, and the page itself
   scrolls.
5. **Focus is looked after.** After a choice, focus goes back to the element that had it before
   the visitor came to the banner, else to the page's `<main>` (which gets `tabindex="-1"` only
   while it has focus), else it stays on the body. A polite live region confirms the choice
   ("Analytics accepted."). The preferences in a dialog use `idg-dialog`, which holds focus and
   gives it back.
6. **Nothing changes until it is saved.** The preferences change nothing on a click of the
   switch; "Save preferences" calls `grant()` or `deny()`. "Withdraw consent and erase" asks
   inline (never `window.confirm`) and then calls `reset()`, which forgets the choice and
   everything the tracker stored: the visitor is asked again.
7. **No edit is lost silently.** If the stored choice changes in another tab, or in the banner,
   while the visitor has an unsaved edit, the edit is dropped and a note says so. Closing the
   dialog with Escape or its close button is a cancel: the unsaved edit is dropped (the next
   opening shows what is stored), and the live region says politely "Changes were not saved."
   Only Save keeps an edit.
   Where the choice changes in another tab while the erase question is open, the question is
   closed, focus goes back to the "Withdraw consent and erase" button, and the live region says
   so.
8. **A press is counted once.** A double click on Accept or Decline chooses once, tells the page
   once and announces once; Save and the erase confirmation ignore a repeat while they run.
9. **A failure is shown, not thrown.** A consent object whose methods throw, or that cannot store
   the choice, gives an inline `idg-alert`, and the choice is not reported as made.

## Placement and space

`placement="bottom"` (the default) makes the **host element** stick to the bottom edge of the
window while its natural place in the page is further on (`position: sticky`). Because it keeps
its place in the page's flow, it reserves its own space: it can never cover the end of the page.

- A **bottom** banner goes **last** in its parent, ordinarily the `<body>`. A sticky element only
  sticks while its natural place is beyond the edge, and only inside its parent, so a parent with
  `overflow: hidden` or `overflow: auto` between the banner and the page defeats it. On a page
  shorter than the window, a bottom banner sits after the content.
- While it is drawn and sticking, the banner keeps the root element's `scroll-padding-block-end`
  as tall as itself, added to the value the page has (from a stylesheet or the root's own style),
  worked out again when the window or the banner changes size, and gives the exact value back when
  the banner goes. A focused element is therefore scrolled clear of the bar and never left behind
  it (WCAG 2.2, 2.4.11 Focus Not Obscured). It does this through the root's style object, which a
  strict Content-Security-Policy allows.
- `placement="top"` is **not** sticky. It is in the page's flow where the element is (put it first
  in the `<body>`), scrolls away with the page and reserves nothing. A bar that stuck to the top
  would sit over a header the layout keeps in view and over what has focus.
- The banner is not printed, and it is painted over a layout's sticky chrome (`z-index` 1 to 3) and
  under the layout's skip link (10), so the skip link is seen whenever it has focus.
- `placement="inline"` is an ordinary block in the page's flow and reserves nothing.
- Under 32rem of window height a bottom banner is not sticky either, and reserves nothing: half of
  such a window would be a box that scrolls inside itself.

## Localisation

Both elements take a `labels` property with every string they show. Give a partial object and the
rest stay English. `ConsentBannerLabels` and `ConsentPreferencesLabels` are exported types, so a
translation is checked by the compiler:

```ts
import type { ConsentBannerLabels, ConsentPreferencesLabels } from "@identgineer/components";

const BANNER: Partial<ConsentBannerLabels> = {
  regionName: "Analyse-Auswahl",
  message: "Dürfen wir Besuche zählen? Ohne Ihre Zustimmung wird nichts gesendet.",
  accept: "Analyse zulassen",
  decline: "Ablehnen",
  choose: "Auswählen",
  acceptedAnnouncement: "Analyse zugelassen.",
  declinedAnnouncement: "Analyse abgelehnt.",
};

const PREFERENCES: Partial<ConsentPreferencesLabels> = {
  title: "Datenschutz",
  save: "Speichern",
  decided: "Ihre Wahl wurde am {time} getroffen.",
};
```

Keep the two choices equally long and equally plain: a translation that makes one of them a
sentence and the other a word undoes rule 1. The message and the policy link can also be given as
slots (`slot="message"`, `slot="policy"`), which is the way to put markup in them. The time of the
choice (`decided`) is formatted with `Intl.DateTimeFormat` in the language of the nearest `lang`
attribute, so set `lang` on `<html>`. The elements mirror in right-to-left, where Decline sits at
the start edge, on the right.

The time of the choice is `decidedAt` in the status the tracker's `consent.get()` returns
(milliseconds, `null` while nothing is stored), and the panel shows it. The language is the
nearest `lang` going outwards through shadow roots, then the document's, then the browser's.

Under "Necessary" the panel shows the words "Always on" (the label `necessaryState`) and no
control: there is nothing to operate, so it is not a disabled switch. The Analytics explanation is
visible text that every reader gets, and the switch also carries it as its accessible description
(the only mechanism `idg-switch` has), so a screen reader that reads the page line by line may
read it twice.

## <a id="csp"></a>Content-Security-Policy

The elements run under
`default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'`.
Every browser test runs under that policy and fails on any violation. The elements use no inline
script or style, no `eval`, and no `innerHTML`. Hide them until they hydrate with a rule in a
stylesheet (`idg-consent-banner:not(.hydrated)`), never an inline style.

## What you remain responsible for

These elements make the fair behaviour the default; they do not make a site compliant. Whether
and how you must ask for consent, what the words must say, how long a choice lasts, what a policy
must contain and which laws apply to your visitors are for **you** to assess, with your own
legal advice. The wording of the defaults is a starting point, not legal text. Raise
`consentVersion` in the tracker when what you collect changes, so that visitors are asked again.
