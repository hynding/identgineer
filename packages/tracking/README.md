# @identgineer/tracking

A consent-first, privacy-first event tracker for the browser. It sends nothing, queues nothing and
stores nothing until the visitor has granted consent, honours Global Privacy Control and Do Not
Track, and collects only the events the page declares, with URLs reduced to a path. It has no
runtime dependencies, uses no cookie and keeps no identifier that outlives a tab.

This package is the client SDK. The collecting endpoint (the CMS side) is a later task; what it
must enforce is listed under [Security notes](#security-notes).

## Use it

```ts
import { createTracker } from "@identgineer/tracking";

const tracker = createTracker({
  endpoint: "https://collect.example.com/v1/events",
  writeKey: "wk_0123456789abcdef", // public and write-only; see the security notes
  consentVersion: 1,
  autoPageViews: true,
  events: {
    signup_completed: { properties: { plan: "string", seats: "number", trial: "boolean" } },
    logout: { properties: {} },
  },
  onDrop: (reason) => console.debug("not tracked:", reason.code, reason.message),
});

// Your consent banner (not part of this package) calls these:
tracker.consent.grant();
tracker.consent.deny();
tracker.consent.onChange((status) => renderBanner(status)); // { state, reason? }

tracker.track("signup_completed", { plan: "pro", seats: 3, trial: false });
tracker.page(); // a page view (automatic with autoPageViews)
tracker.identify("u_8f3a2c"); // an opaque id; never an email or a name
await tracker.flush();
tracker.dispose(); // removes every listener and timer
```

`createTracker` throws a `TypeError` for an invalid option (a wrong endpoint, a malformed key, an
invalid event declaration) and does nothing at import time. After that no method throws: a call
that cannot be honoured is dropped and reported to `onDrop`. The package is safe to import and to
call without a DOM (server-side rendering): without `window` or storage nothing can be recorded, so
nothing happens.

## What is collected, and what never is

| Collected                                                                                        | Never collected                                                                        |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| The event name and the properties the page declared for it, with the declared types              | Properties, or events, the page did not declare (dropped, reported by key, never sent) |
| The page's path (`/cart`), plus the query parameters the page listed in `allowedQueryParameters` | The host, credentials, the fragment, and every other query parameter                   |
| On a page view, the referrer's origin (`https://www.example.org`), unless it is the page's own   | The referrer's path or query                                                           |
| A random session id, 128 bits, in `sessionStorage`, replaced after 30 minutes of inactivity      | A visitor id across sessions, a cookie, a fingerprint, a device id                     |
| A client-generated event id (for de-duplication) and the time of the event                       | The user agent string, the screen size, the language list, the time zone, the plugins  |
| An opaque user id, only if the page called `identify` with one                                   | An email address or a name: `identify` refuses a value containing `@`                  |
| `sentAt` on each batch, so the server can correct clock skew                                     | The page title, the DOM, form values, clicks the page did not declare, the IP address  |

The HTTP request itself reveals the visitor's IP address and `User-Agent` header to the collector,
as every request does. The SDK adds neither to the body, and the collector must not store them
(see the security notes).

String properties are cut to `maxStringLength` UTF-16 units (256 by default) on a code point
boundary, lone surrogates become U+FFFD, numbers must be finite, and nothing nested is accepted.
A path is cut at 512 characters.

### What is stored in the browser

Only while consent is granted, except the first row:

| Key                       | Storage          | Holds                                                             |
| ------------------------- | ---------------- | ----------------------------------------------------------------- |
| `idg.tracking.consent.v1` | `localStorage`   | `{ state, version, decidedAt }`: written once the visitor chooses |
| `idg.tracking.queue.v1`   | `localStorage`   | Events not yet delivered (the offline queue)                      |
| `idg.tracking.session.v1` | `sessionStorage` | The session id and the time of its last event                     |

In `unknown` and `denied` the SDK writes nothing else. A cookie is never set and `localStorage`
never holds a session id.

## Consent

The consent state is `unknown` (the default), `granted` or `denied`. Only `analytics` is
this SDK's category; strictly necessary storage is not tracked at all.

| Method                       | Effect                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `consent.get()`              | `{ state, reason? }`: the effective consent, read afresh from storage and the browser                                |
| `consent.grant()`            | Stores `granted`; returns whether it could be stored                                                                 |
| `consent.deny()`             | Stores `denied` and revokes (below)                                                                                  |
| `consent.reset()`            | Removes the choice and every key the SDK wrote: the visitor is asked again                                           |
| `consent.onChange(listener)` | Calls `listener(status)` when the effective consent changes, here or in another tab; returns an unsubscribe function |

**The record.** One key holds `{ state, version, decidedAt }`. Raising `consentVersion` makes an
older record count as `unknown`, so visitors are asked again after a change to what you collect.
Every read is validated strictly: anything the SDK would not have written (other keys, another
state, text that is too long, a `__proto__` key) is `unknown`. Storage is the truth: when storage
cannot be read, consent is `unknown`; when it cannot be written, `grant()` returns `false` and
nothing is enabled. A `deny()` or `reset()` that could not be written is remembered in memory, so
the grant still in storage cannot come back.

**Global Privacy Control and Do Not Track.** `navigator.globalPrivacyControl === true` and Do Not
Track of `"1"` (`navigator.doNotTrack`, `window.doNotTrack`, `navigator.msDoNotTrack`) are
honoured. While either is set, effective consent is `denied` whatever is stored, and `get()`
reports `reason: "gpc"` or `reason: "dnt"` (GPC first) so a banner can say why. `grant()` still
records the visitor's choice but enables nothing while a signal is set; when the signal goes away
the stored choice applies again. The signals are read at every use, so one that appears after the
page loaded counts at the next call, send or timer, and is treated as a revocation.

**Revocation.** `deny()`, `reset()`, a consent version change seen at start, and a browser signal
appearing all do the same, at once: the in-memory queue is dropped, the stored queue and the
session id are removed (every key but the consent record for `deny()` and a signal; all keys for
`reset()`), the session id is rotated away, the identified user is forgotten and every timer is
cancelled. Nothing in a request's answer is acted on afterwards: no retry, no write.

**Cross-tab.** A change in one tab is announced to the others over a `BroadcastChannel`
(injectable as `crossTab`); they re-read the record and apply the same effects. Because consent is
also re-read from storage at every send, a tab without a channel, or with a notice still on its
way, cannot send after another tab revoked.

## API

| Method                     | Effect                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `track(name, properties?)` | Records a declared event. An undeclared name or property is dropped and reported to `onDrop`                                     |
| `page(overrides?)`         | Records a `page_view` for the current page; `overrides` may give `path` and `referrer`                                           |
| `identify(id \| null)`     | Attaches an opaque id to later events; `null` clears it. A value that is not `[A-Za-z0-9_-]{1,64}` (an email, a name) is refused |
| `flush()`                  | Sends what is queued, one batch at a time; resolves when done, never rejects                                                     |
| `dispose()`                | Removes every listener and timer and restores `history`; idempotent. Afterwards every method is a no-op                          |

Event names match `^[a-z][a-z0-9_]{0,63}$` and must be declared in `options.events`, with each
property's key and type (`"string"`, `"number"` or `"boolean"`). `page_view` is built in and is
only recorded by `page()`.

`onDrop` receives `{ code, message }`; the message names an event or a property key, never a
value. Codes: `invalid-event-name`, `undeclared-event`, `undeclared-property`, `invalid-property`,
`invalid-properties`, `invalid-identifier`, `invalid-url`, `event-too-large`, `queue-overflow`,
`expired`, `rejected-by-server`, `no-random-source`. Nothing is reported for an event that is
not tracked because consent is missing.

**Automatic page views** (`autoPageViews: true`) record the page when consent is granted and each
navigation by `pushState`, `replaceState` or `popstate`, skipping one whose recorded path did not
change. The SDK wraps `history.pushState` and `history.replaceState` for that and nothing else;
`dispose()` restores them (and, if another script wrapped them since, leaves that script's wrapper
alone and stops reporting).

**Sessions.** A random id (128 bits from `crypto.getRandomValues`, base64url) lives in
`sessionStorage` and is replaced after `sessionTimeout` of inactivity and on revocation. A reload
in the same tab continues the session; a new tab starts another. Without `crypto` no event can be
given an id and `no-random-source` is reported: ids never come from `Math.random`.

## Options

| Option                   | Default                                   | Meaning                                                                                                |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `endpoint`               | required                                  | An absolute `https:` URL (or `http:` on `localhost` or `127.0.0.1`); no credentials, query or fragment |
| `writeKey`               | required                                  | The public write key, `[A-Za-z0-9_-]{16,128}`                                                          |
| `events`                 | required                                  | The declared events and the type of each property                                                      |
| `consentVersion`         | `1`                                       | A positive whole number; raising it asks everyone again                                                |
| `autoPageViews`          | `false`                                   | Record page views by itself                                                                            |
| `allowedQueryParameters` | `[]`                                      | Query parameter names kept in the path, `[A-Za-z0-9_.~-]{1,64}` each                                   |
| `maxStringLength`        | `256`                                     | UTF-16 units kept of a string (1 to 1024)                                                              |
| `maxBatchSize`           | `20`                                      | Events that trigger a flush, and the most in one request (1 to 500)                                    |
| `flushInterval`          | `5000`                                    | Milliseconds from the first waiting event to a flush                                                   |
| `maxPayloadBytes`        | `32768`                                   | The most UTF-8 bytes of a request body (1024 to 65536, the limit of a beacon)                          |
| `maxQueueEvents`         | `200`                                     | The most events kept for delivery; the oldest go first                                                 |
| `maxQueueBytes`          | `102400`                                  | The most bytes of events kept for delivery                                                             |
| `sessionTimeout`         | `1800000`                                 | Milliseconds of inactivity after which the session id changes (30 minutes)                             |
| `onDrop`                 | none                                      | Told why something was dropped; an exception from it is ignored                                        |
| `fetch`                  | `globalThis.fetch`                        | `null` sends nothing                                                                                   |
| `sendBeacon`             | `navigator.sendBeacon`                    | `null` falls back to a keepalive `fetch` when the page is hidden                                       |
| `localStorage`           | `globalThis.localStorage`                 | Consent record and offline queue; `null`, or one that fails, means consent cannot be recorded          |
| `sessionStorage`         | `globalThis.sessionStorage`               | The session id                                                                                         |
| `clock`                  | `Date.now` and `setTimeout`               | `{ now, setTimeout, clearTimeout }`                                                                    |
| `crypto`                 | `globalThis.crypto`                       | `getRandomValues` for ids                                                                              |
| `random`                 | `Math.random`                             | Retry jitter only                                                                                      |
| `page`                   | the browser's `window` and `document`     | Location, referrer, signals, and the hidden, online and navigation events                              |
| `crossTab`               | a `BroadcastChannel` where there is a DOM | `{ post, subscribe }`; `null` turns it off                                                             |

The numeric options are checked at creation and throw a `TypeError` naming the option.

## Delivery

- **Batching.** Events queue and flush when the queue reaches `maxBatchSize`, after
  `flushInterval`, and when the page is hidden (`visibilitychange` to hidden, `pagehide`).
  A flush sends everything queued, a batch at a time. Never more than one request is in flight.
- **The request.** `fetch` with `POST`, `Content-Type: application/json`,
  `credentials: "omit"`, `mode: "cors"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`
  and `redirect: "error"`. The write key is in the `X-Idg-Write-Key` header, never in the URL.
- **Leaving the page.** The queue goes by `navigator.sendBeacon`, falling back to `fetch` with
  `keepalive: true`. A beacon cannot set a header, so **the write key is in the JSON body of a
  beacon** (`writeKey`), still never in the URL. A beacon is sent as `text/plain`: the collector
  must parse its body as JSON whatever the content type. If a request is in flight, or a retry is
  waiting, or the browser is offline, nothing is sent at that moment and the events stay in the
  offline queue.
- **Payload cap.** A body never exceeds `maxPayloadBytes`: a batch is split to fit, and an event
  that alone exceeds it is dropped (`event-too-large`).
- **Retry.** A network failure, a `5xx` and a `429` keep the batch and retry it with an
  exponential backoff (1 second doubling to a cap of 5 minutes) jittered between half and all of
  each step, and honouring `Retry-After` in seconds or as an HTTP date, at most an hour. A
  garbage `Retry-After` is ignored. Any other `4xx` drops the batch and reports
  `rejected-by-server`.
- **Offline queue.** While consent is granted, events not yet delivered are kept in
  `localStorage`, at most `maxQueueEvents` and `maxQueueBytes` (the oldest dropped first). On load
  the whole stored queue is discarded if any part is malformed, events older than 24 hours are
  discarded, and an event over the payload cap is dropped. Delivery waits while
  `navigator.onLine` is `false` and resumes on the `online` event. With several tabs open the
  stored queue is shared, last writer wins, and a tab that starts reads it: an event can be sent
  twice, which the server de-duplicates by id.

## Wire format

A batch is JSON, version `v: 1`:

```json
{
  "v": 1,
  "sentAt": 1767268800000,
  "events": [
    {
      "id": "oACH-_dHnLht_nR9I2c_Jw",
      "name": "signup_completed",
      "at": 1767268797000,
      "session": "Q1xk3p0r2uGq9mYHbm1d7A",
      "user": "u_8f3a2c",
      "path": "/pricing?utm_source=news",
      "referrer": "https://www.example.org",
      "properties": { "plan": "pro", "seats": 3, "trial": false }
    }
  ]
}
```

`user`, `path`, `referrer` and `properties` are optional, and `writeKey` is added at the top level
of a beacon's batch only. Timestamps are whole milliseconds since the epoch on the client's clock;
`sentAt` lets the server correct for skew (`at + (serverNow - sentAt)`). Limits: 1 to 500 events per
batch, 32 properties per event, strings of at most 1024 UTF-16 units without lone surrogates, a
path of at most 2048 ASCII characters with no fragment, a referrer that is an origin and nothing
else.

`@identgineer/tracking/wire` has no browser dependency, so a server (and the later ingestion
feature) can reuse it:

```ts
import { parseTrackingBatch, TRACKING_BATCH_JSON_SCHEMA } from "@identgineer/tracking/wire";

const result = parseTrackingBatch(JSON.parse(body));
if (!result.ok) return reject(400, result.error); // names the field and the rule
```

`parseTrackingBatch` is strict: an unknown key, an own `__proto__`, a non-finite number, a nested
value or a lone surrogate is refused, never repaired. `TRACKING_BATCH_JSON_SCHEMA` is the same
format as JSON Schema (draft 2020-12); a test holds it to the validator.

## Security notes

- **The write key is public and write-only by design.** It ships in page source, so anyone can
  read it. It can only append events; it reads nothing. It identifies a property (a site), not a
  person, and is not a secret.
- **What the server must enforce**, since the key alone proves nothing:
  - an **origin allowlist**: accept a request only when `Origin` is one of the property's
    origins, and answer CORS for exactly those;
  - **rate limits** per key and per client, answering `429` with `Retry-After`;
  - **schema validation** with `parseTrackingBatch` (or the schema), the payload cap, and
    refusal of any other `Content-Type` than `application/json` or `text/plain` (beacons);
  - a **key scoped to one property**: events are stored against the property the key belongs
    to, never one the body names;
  - de-duplication by event id, clock-skew correction from `sentAt`, and no storage of the IP
    address or `User-Agent` of a request;
  - removal of `writeKey` from a beacon's body before anything is stored.
- The key travels in a header (a body field for a beacon), never in the URL, so it is not in
  access logs or in a referrer.
- No `eval`, `Function`, `innerHTML`, inline script or inline style is used; a test holds the
  source to that. The SDK needs no `unsafe-inline` or `unsafe-eval` in a Content-Security-Policy:
  add the endpoint to `connect-src`.
- Every value read from storage is validated; malformed or hostile JSON (including `__proto__`
  keys) is discarded and never merged into an object.
- Never pass an email address, a name or any other personal data to `identify` or as a
  property. Declare only what you need.

## Limits

- **A request already in flight cannot be recalled.** Revoking consent drops everything queued and
  ignores the answer, but the bytes of a request the browser already sent are on their way.
- A beacon carries the write key in its body, and the browser gives no answer for it: whether the
  collector accepted it is unknown, so those events are removed from the queue once the browser
  took the beacon.
- Without readable and writable `localStorage` the choice cannot be recorded, so nothing is
  tracked. Without `BroadcastChannel` other tabs learn of a change at their next call.
- Consent made in one browser or on one origin does not apply to another.
- Properties are typed by declaration at run time; TypeScript does not narrow `track` by event
  name.

## Testing

`@identgineer/tracking/testing` exports fakes, so an app's tests need no network or browser:
`createFakeCollector` (an endpoint that records requests, answers from a script and validates
every batch against the contract, listing what it found in `violations`), `createManualClock`,
`createMemoryStorage` (logs calls, can fail or run out of quota), `createFakePage` (location,
referrer, GPC and DNT, hide, offline and navigation), `createCrossTabHub` and
`createSeededRandom`. Pass them as the `fetch`, `sendBeacon`, `localStorage`, `sessionStorage`,
`clock`, `crypto`, `random`, `page` and `crossTab` options.
