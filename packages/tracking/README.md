# @identgineer/tracking

A consent-first, privacy-first event tracker for the browser. It sends nothing, queues nothing and
stores nothing until the visitor has granted consent, honours Global Privacy Control and Do Not
Track, and collects only the events the page declares, with URLs reduced to a path. It has no
runtime dependencies, uses no cookie and keeps no identifier that outlives a tab.

This package is the client SDK. The collecting endpoint is the CMS's `POST /api/ingest/events`
(on Strapi and on strapi-php; `cms/README.md`, "Event ingestion"): point `endpoint` at it and use a
property's `ingestKey` as `writeKey`. What it enforces is listed under
[Security notes](#security-notes).

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

## Reading it back: `@identgineer/tracking/dashboard`

A separate entry point, never loaded by the tracker, reads what was collected for the dashboard
components (`docs/dashboard/`). It imports nothing from `@identgineer/components`, and its result
is assignable to their `DashboardSource`:

```ts
import { validatedSource } from "@identgineer/components";
import { createCmsDashboardSource } from "@identgineer/tracking/dashboard";

const source = validatedSource(
  createCmsDashboardSource({ baseUrl: "https://cms.example.com", fetch: identity.authorizedFetch }),
);
```

`fetch` is the identity client's `authorizedFetch` (or any fetch that sends the signed-in user's
bearer token), so the CMS answers only that user's properties. `baseUrl` is an https origin
(`http` only for `localhost` and loopback addresses). Every request is a GET without cookies, that
follows no redirect and is never cached; every answer is read to a bounded size and must be
exactly what the model allows.

| Method                  | Request                                                    | Notes                                                                                       |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `listProperties()`      | `GET /api/properties` (name and domain only), page by page | Up to `MAX_DASHBOARD_PROPERTIES` (200); never the `ingestKey`; origin is `https://<domain>` |
| `listEvents(id, query)` | `GET /api/events` filtered by the property                 | `pageSize` at most `MAX_DASHBOARD_PAGE_SIZE` (25); an empty answer is confirmed (below)     |
| `summary(id, range)`    | `GET /api/properties/<id>/summary?range=24h\|7d\|30d`      | One call                                                                                    |

It rejects only with `CmsDashboardError`, whose `name` is `"DashboardError"` so that
`validatedSource` carries its `code` on, with a fixed message that holds no id, URL or server text:

| Code               | When                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `unauthenticated`  | 401, or the identity client has no session                                                         |
| `not-found`        | 403 or 404 for a property; an empty event list for a property the caller cannot read               |
| `unavailable`      | A network failure, 429, 5xx, or 403/404 on the property list                                       |
| `invalid-request`  | An id, page, page size, sort or range that is not valid; nothing is sent                           |
| `invalid-response` | Anything else: an answer that is not JSON, too large, or not exactly a page of the model's records |

A filter by a property that is not the caller's finds no events rather than failing, so an empty
list is followed by `GET /api/properties/<id>`, and a 404 there answers `not-found`: an empty page
is never the answer for someone else's property. The CMS side is in `cms/README.md`, "The
dashboard's reads".

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
A path is cut at 512 characters. Inside it, matrix parameters (`/a;jsessionid=...`, everything
from the first `;` of a segment) are cut, and a segment that contains an at sign (`@` or `%40`) or
an encoded `?` or `#` (`%3F`, `%23`, in any case), which is how a mail address or a URL travels in
a path, is replaced by `-`. **Other identifiers in a path segment are not recognisable and are not
scrubbed**: `/orders/84213` is sent as it is, so keep personal data out of your paths, or send the
page view with `page({ path })` and a path you chose.

### What is stored in the browser

Only while consent is granted, except the first row:

| Key                         | Storage          | Holds                                                                |
| --------------------------- | ---------------- | -------------------------------------------------------------------- |
| `idg.tracking.consent.v1`   | `localStorage`   | `{ state, version, decidedAt }`: written once the visitor chooses    |
| `idg.tracking.queue.v1`     | `localStorage`   | Events not yet delivered (the offline queue), without a session id   |
| `idg.tracking.delivered.v1` | `localStorage`   | Up to 200 ids of events a tab delivered, with the time, for 24 hours |
| `idg.tracking.session.v1`   | `sessionStorage` | The session id and the time of its last event                        |

In `unknown` and `denied` the SDK writes nothing else. A cookie is never set and `localStorage`
never holds a session id: the offline queue is stored without it, and an event restored in a later
page load is sent with no `session` at all, never with the new page's. (Events in memory keep
theirs.) If the page called `identify`, the opaque `user` id is stored with the queued events it
was attached to, until they are delivered.

## Consent

The consent state is `unknown` (the default), `granted` or `denied`. Only `analytics` is
this SDK's category; strictly necessary storage is not tracked at all.

| Method                       | Effect                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `consent.get()`              | `{ state, reason?, decidedAt }`: the effective consent, read afresh; `decidedAt` is the time of the stored decision, `null` while none is stored |
| `consent.grant()`            | Stores `granted`; returns whether it could be stored. Refused (`false`, nothing written) while GPC or DNT is set                                 |
| `consent.deny()`             | Stores `denied` and revokes (below)                                                                                                              |
| `consent.reset()`            | Removes the choice and every key the SDK wrote: the visitor is asked again                                                                       |
| `consent.onChange(listener)` | Calls `listener(status)` when the effective consent changes, here or in another tab; returns an unsubscribe function                             |

**The record.** One key holds `{ state, version, decidedAt }`. Raising `consentVersion` makes an
older record count as `unknown`, so visitors are asked again after a change to what you collect.
Every read is validated strictly: anything the SDK would not have written (other keys, another
state, text that is too long, a `__proto__` key) is `unknown`. Storage is the truth: when storage
cannot be read, consent is `unknown`; when it cannot be written, `grant()` returns `false` and
nothing is enabled. A `deny()` or `reset()` that could not be written is remembered in memory, so
the grant still in storage cannot come back. The time of each decision only ever increases (a
decision made in the same millisecond as the one it replaces is written one later), so a change of
`decidedAt` means a decision was made.

**Global Privacy Control and Do Not Track.** `navigator.globalPrivacyControl === true` and Do Not
Track of `"1"` (`navigator.doNotTrack`, `window.doNotTrack`, `navigator.msDoNotTrack`) are
honoured. While either is set, effective consent is `denied` whatever is stored, and `get()`
reports `reason: "gpc"` or `reason: "dnt"` (GPC first) so a banner can say why. `grant()` returns
`false` while a signal is set and writes nothing: the stored choice stays as it was (so a signal
that goes away does not turn tracking on), and the reason is in `consent.get()`. `deny()` and
`reset()` are still stored. The signals are read at every use, so one that appears after the
page loaded counts at the next call, send or timer, and is treated as a revocation.

**Revocation.** `deny()`, `reset()`, a consent version change seen at start, and a browser signal
appearing all do the same, at once: the in-memory queue is dropped, the stored queue and the
session id are removed (every key but the consent record for `deny()` and a signal; all keys for
`reset()`), the session id is rotated away, the identified user is forgotten and every timer is
cancelled. Nothing in a request's answer is acted on afterwards: no retry, no write. When storage
cannot be read, removing the queue is still attempted.

**Callbacks.** `onDrop` and `consent.onChange` listeners may call the tracker back (`deny()`,
`grant()`, `track()`, `dispose()`). Consent is checked again before an event is queued, so an
`onDrop` that revokes in the middle of `track()` leaves nothing queued or stored; status changes
are announced one at a time and in order, so no listener hears a later status before an earlier
one; and a report is made only after the state it describes is settled.

**Cross-tab.** A change in one tab is announced to the others over a `BroadcastChannel`
(injectable as `crossTab`); they re-read the record and apply the same effects. The `storage` event of the record's key (a
write, a removal or a `clear()`) makes them read it again, since a notice on the channel can come
before the write it announces is visible to the tab; a listener is also told when the decision time
changes under the same state. Because consent is
also re-read from storage at every send, a tab without a channel, or with a notice still on its
way, cannot send after another tab revoked. A tab that missed a `deny()` and sees only the grant after
it (the channel's notices were lost, or it has no channel) notices that the decision time of the
stored record changed while it stood granted, takes that as a revocation, and discards its queue
and its identified user. A second `grant()` from another tab while this one stands granted looks
the same and is treated the same way: its queued events are discarded, which is the safe side.

## API

| Method                     | Effect                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `track(name, properties?)` | Records a declared event. An undeclared name or property is dropped and reported to `onDrop`                                     |
| `page(overrides?)`         | Records a `page_view` for the current page; `overrides` may give `path` and `referrer`                                           |
| `identify(id \| null)`     | Attaches an opaque id to later events; `null` clears it. A value that is not `[A-Za-z0-9_-]{1,64}` (an email, a name) is refused |
| `flush()`                  | Sends what is queued, one batch at a time; resolves when done, never rejects                                                     |
| `dispose()`                | Removes every listener and timer and restores `history`; idempotent. Afterwards every method is a no-op                          |

**One tracker per page.** Two trackers on the same storage keys would each hold a queue, a session
and timers for them, which is unsupported. `createTracker` therefore keeps a registry per page,
keyed by the endpoint, the write key and the pair of storage objects, and a second call that finds
the first undisposed returns **the same instance** (and ignores its other options) until
`dispose()` has been called on it. The second call's `consentVersion` and `events` are ignored as
well; when they differ from the first call's, `onDrop` is told once, with the code
`tracker-options-ignored`. Without both storages there is nothing to share and every call
makes its own tracker.

Event names match `^[a-z][a-z0-9_]{0,63}$` and must be declared in `options.events`, with each
property's key and type (`"string"`, `"number"` or `"boolean"`; write the declarations inline or
`as const`, so TypeScript keeps the literal types). `page_view` is built in and is
only recorded by `page()`.

`onDrop` receives `{ code, message }`; the message names an event or a property key, never a
value. Codes: `invalid-event-name`, `undeclared-event`, `undeclared-property`, `invalid-property`,
`invalid-properties`, `invalid-identifier`, `invalid-url`, `event-too-large`, `queue-overflow`,
`expired`, `rejected-by-server`, `no-random-source`, `tracker-options-ignored`. Nothing is reported for an event that is
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

| Option                   | Default                                   | Meaning                                                                                                            |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `endpoint`               | required                                  | An absolute `https:` URL (or `http:` on `localhost` or `127.0.0.1`); no credentials, query or fragment             |
| `writeKey`               | required                                  | The public write key, `[A-Za-z0-9_-]{16,128}`                                                                      |
| `events`                 | required                                  | The declared events and the type of each property                                                                  |
| `consentVersion`         | `1`                                       | A positive whole number; raising it asks everyone again                                                            |
| `autoPageViews`          | `false`                                   | Record page views by itself                                                                                        |
| `allowedQueryParameters` | `[]`                                      | Query parameter names kept in the path, `[A-Za-z0-9_.~-]{1,64}` each                                               |
| `maxStringLength`        | `256`                                     | UTF-16 units kept of a string (1 to 1024)                                                                          |
| `maxBatchSize`           | `20`                                      | Events that trigger a flush, and the most in one request (1 to 500)                                                |
| `flushInterval`          | `5000`                                    | Milliseconds from the first waiting event to a flush                                                               |
| `maxPayloadBytes`        | `32768`                                   | The most UTF-8 bytes of a request body (1024 to 65536, the limit of a beacon)                                      |
| `maxQueueEvents`         | `200`                                     | The most events kept for delivery; the oldest go first                                                             |
| `maxQueueBytes`          | `102400`                                  | The most bytes of events kept for delivery                                                                         |
| `sessionTimeout`         | `1800000`                                 | Milliseconds of inactivity after which the session id changes (30 minutes)                                         |
| `requestTimeout`         | `30000`                                   | Milliseconds before a request with no answer is aborted and retried (1000 to 600000)                               |
| `onDrop`                 | none                                      | Told why something was dropped; an exception from it is ignored                                                    |
| `fetch`                  | `globalThis.fetch`                        | `null` sends nothing                                                                                               |
| `sendBeacon`             | `navigator.sendBeacon`                    | `null` falls back to a keepalive `fetch` when the page is hidden                                                   |
| `localStorage`           | `globalThis.localStorage`                 | Consent record, offline queue and delivered-id marker; `null`, or one that fails, means consent cannot be recorded |
| `sessionStorage`         | `globalThis.sessionStorage`               | The session id                                                                                                     |
| `clock`                  | `Date.now` and `setTimeout`               | `{ now, setTimeout, clearTimeout }`                                                                                |
| `crypto`                 | `globalThis.crypto`                       | `getRandomValues` for ids                                                                                          |
| `random`                 | `Math.random`                             | Retry jitter only                                                                                                  |
| `page`                   | the browser's `window` and `document`     | Location, referrer, signals, and the hidden, online, navigation and storage events                                 |
| `crossTab`               | a `BroadcastChannel` where there is a DOM | `{ post, subscribe }`; `null` turns it off                                                                         |

The numeric options are checked at creation and throw a `TypeError` naming the option.

## Delivery

- **Batching.** Events queue and flush when the queue reaches `maxBatchSize`, after
  `flushInterval`, and when the page is hidden (`visibilitychange` to hidden, `pagehide`).
  A flush sends everything queued, a batch at a time. Never more than one `fetch` is in flight (a
  beacon is fire-and-forget and does not count as one; see below).
- **Timeout.** A request with no answer after `requestTimeout` is aborted (an `AbortController`
  signal) and treated like a network failure, so it is retried and cannot hold delivery for ever.
  A `fetch` that ignores its signal is given up on all the same.
- **The request.** `fetch` with `POST`, `Content-Type: application/json`,
  `credentials: "omit"`, `mode: "cors"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`
  and `redirect: "error"`. The write key is in the `X-Idg-Write-Key` header, never in the URL.
- **Leaving the page.** The queue goes by `navigator.sendBeacon`, falling back to `fetch` with
  `keepalive: true`. A beacon cannot set a header, so **the write key is in the JSON body of a
  beacon** (`writeKey`), still never in the URL. A beacon is sent as `text/plain`: the collector
  must parse its body as JSON whatever the content type, and each batch says which it is in its
  `transport` field (`"beacon"` carries `writeKey`, `"fetch"` never does). If a `fetch` is in
  flight when the page is hidden, the queued events that are **not** in that request leave by
  beacon (a beacon does not count as a request in flight) and are treated as delivered once the
  browser took them; no second `fetch` starts, and when the browser refuses the beacon they stay
  queued. While a retry is waiting (a backoff or a `Retry-After`) or the browser is offline,
  nothing is sent at that moment and the events stay in the offline queue.
- **Payload cap.** A body never exceeds `maxPayloadBytes`: a batch is split to fit, and an event
  that alone exceeds it is dropped (`event-too-large`).
- **Retry.** A network failure, a `5xx` and a `429` keep the batch and retry it with an
  exponential backoff (1 second doubling to a cap of 5 minutes) jittered between half and all of
  each step, and honouring `Retry-After` in seconds or as an HTTP date, at most an hour. A
  garbage `Retry-After` is ignored. The wait is never longer than the delay chosen, even if the
  clock is set back meanwhile. Any other `4xx` drops the batch and reports
  `rejected-by-server`.
- **Offline queue.** While consent is granted, events not yet delivered are kept in
  `localStorage`, at most `maxQueueEvents` and `maxQueueBytes` (the oldest dropped first). On load
  a stored value longer than four characters per byte of `maxQueueBytes` is discarded without
  being parsed, only the newest `maxQueueEvents` events are looked at, the whole stored queue is
  discarded if any part of that is malformed, events older than 24 hours, or stamped more than five minutes
  ahead of the clock, are discarded, and an event over the payload cap is dropped. Delivery waits while
  `navigator.onLine` is `false` and resumes on the `online` event. With several tabs open the
  stored queue is shared: a tab writes its own queue **merged by event id with what is stored**
  (date order, the caps applied over the whole, the oldest dropped first) and removes only the ids
  it delivered or dropped, so it never erases what another tab queued. A tab that starts reads the
  queue, so two tabs can both hold an event; the one that delivers it records its id in
  `idg.tracking.delivered.v1` (at most 200 ids, none older than 24 hours, written only while
  consent is granted and removed on revocation), and a tab drops any id it finds there from its
  queue and from what it writes, so the event is not sent twice. Beyond 200 deliveries in 24 hours
  the oldest ids leave that record, and a tab still holding such an event can send it again, so
  the server still de-duplicates by id. The read and the write are not atomic across tabs, so two
  tabs writing in the same instant can still lose an event. Every page of one origin should use
  the same `maxQueueBytes`: a page with a smaller limit discards a stored queue written under a
  larger one.

## Wire format

A batch is JSON, version `v: 1`:

```json
{
  "v": 1,
  "sentAt": 1767268800000,
  "transport": "fetch",
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

`user`, `path`, `referrer` and `properties` are optional, and so is an event's `session`: an event
restored from the offline queue in a later page load has none. `transport` is `"fetch"` or
`"beacon"`, and `writeKey` is present at the top level of a beacon's batch (and only there). Timestamps are whole milliseconds since the epoch on the client's clock;
`sentAt` lets the server correct for skew (`at + (serverNow - sentAt)`). Limits: 1 to 500 events per
batch, 32 properties per event, strings of at most 1024 code points (the schema counts them the same way) without lone surrogates,
event ids unique within a batch (an array with holes is refused too), a
path of at most 2048 ASCII characters with no fragment, a referrer that is an origin and nothing
else.

`@identgineer/tracking/wire` has no browser dependency, so a server can reuse it (the CMS, built
on its own, restates it in its handlers and is held to the shared vectors instead):

```ts
import {
  MAX_TRACKING_BATCH_BYTES,
  parseTrackingBatchText,
  TRACKING_BATCH_JSON_SCHEMA,
} from "@identgineer/tracking/wire";

// Cap the body as it is read from the socket, at MAX_TRACKING_BATCH_BYTES (65536), then:
const result = parseTrackingBatchText(body);
if (!result.ok) return reject(400, result.error); // names the field and the rule
```

`parseTrackingBatchText(text)` refuses a body above `MAX_TRACKING_BATCH_BYTES` before it calls
`JSON.parse`. It can only see what was already buffered, so **the server must cap the body while
reading it**, before it has the text to hand over. `parseTrackingBatch(value)` takes a value that
was parsed already.

`parseTrackingBatch` is strict: an unknown key, an own `__proto__`, a non-finite number, a nested
value or a lone surrogate is refused, never repaired. `TRACKING_BATCH_JSON_SCHEMA` is the same
format as JSON Schema (draft 2020-12); a test holds it to the validator. A schema cannot say that
event ids are unique within a batch: the validator refuses a duplicate id, a schema alone does not.

## Security notes

- **The write key is public and write-only by design.** It ships in page source, so anyone can
  read it. It can only append events; it reads nothing. It identifies a property (a site), not a
  person, and is not a secret.
- **What the server must enforce**, since the key alone proves nothing (the CMS's ingestion
  handlers do all of it, held to the same request vectors as `parseTrackingBatch`,
  `src/testing/batch-vectors.json`):
  - an **origin allowlist**: accept a request only when `Origin` is one of the property's
    origins. The CMS answers the CORS preflight for any origin (a key's origins are only known
    once the body is read) and then refuses an absent or unlisted `Origin` with `403`;
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
- A decision made at the largest timestamp the parser accepts is written at that same timestamp,
  so a later decision there cannot be told from it by its time alone.
- Two trackers for the same endpoint, key and storages on one page are unsupported; the second
  call returns the first (see the API section). Trackers in two tabs are supported.
- The SDK reads the clock it is given. A stored event stamped more than five minutes ahead is
  dropped when loaded, and a backoff cannot outlast its delay, but a clock set wrongly still
  stamps events wrongly: `sentAt` lets the server see the skew.
- Consent made in one browser or on one origin does not apply to another.
- Properties are typed by declaration at run time; TypeScript does not narrow `track` by event
  name.

## Testing

`@identgineer/tracking/testing` exports fakes, so an app's tests need no network or browser:
`createFakeCollector` (an endpoint that records requests, answers from a script and validates
every batch against the contract, listing what it found in `violations`), `createManualClock`,
`createMemoryStorage` (logs calls, can fail or run out of quota), `createFakePage` (location,
referrer, GPC and DNT, hide, offline and navigation), `createCrossTabHub` and
`createSeededRandom`. The fake clock can also jump forward or back without running timers
(`jump`), and the fake storage can fail reads alone (`failReads`). Pass them as the `fetch`, `sendBeacon`, `localStorage`, `sessionStorage`,
`clock`, `crypto`, `random`, `page` and `crossTab` options.
