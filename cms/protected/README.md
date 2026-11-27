# protected/

Hand-written code that camis must never overwrite. `camis build` mirrors this directory into
**every** target's output after generating it (`cms/generated/strapi` and
`cms/generated/strapi-php`), so a file here wins over the generated or seeded file at the same path.
`cms/generated/` itself is git-ignored and disposable; anything that must survive a rebuild lives
here. This README is copied into both outputs too.

camis has one protected directory for all targets, so a PHP file placed here is also copied into
the Strapi project and a TypeScript file into the Laravel app. Both are inert in the other target.
Keep each language under the path its own target expects:

| What                               | strapi-php (Laravel) path           | Strapi path                                 |
| ---------------------------------- | ----------------------------------- | ------------------------------------------- |
| `IngestEvent` endpoint             | `app/Hooks/IngestEvent.php`         | `src/api/event/controllers/ingest-event.ts` |
| Its parts (validation, rows)       | `app/Ingest/*.php`                  | `src/ingest/*.ts`                           |
| Its limits                         | `config/ingest.php`                 | `src/ingest/settings.ts`                    |
| `IssueIngestKey` hook (Property)   | `app/Hooks/IssueIngestKey.php`      | `src/hooks/issue-ingest-key.ts`             |
| `DropClientIngestKey` middleware   | `app/Hooks/DropClientIngestKey.php` | `src/middlewares/drop-client-ingest-key.ts` |
| `PurgeExpiredEvents` schedule      | `app/Hooks/PurgeExpiredEvents.php`  | `src/cron/purge-expired-events.ts`          |
| Handler tests (PHPUnit)            | `tests/Feature/Ingest/*.php`        | — (Vitest, `cms/tests/ingest-*.test.ts`)    |
| Extra API routes (strapi-php only) | `routes/api-custom.php`             | —                                           |
| REST page cap (Strapi only)        | —                                   | `config/api.ts`                             |

Each hook, endpoint and route path above is seeded by camis as a stub the first time it builds,
implementing a generated contract (`app/Hooks/Contracts/*.php`, `src/hooks/contracts/*.ts`). Copy a
stub here before filling it in; editing it under `cms/generated/` would be lost on the next clean
build. The Strapi files restate the contract's interface rather than import it, so they compile
here too.

`config/api.ts` replaces Strapi's generated REST settings to cap a page at 25 rows, as
`CAMIS_REST_MAX_LIMIT` does on strapi-php (see `cms/README.md`); it is inert in the Laravel app.

## The ingestion endpoint

`IngestEvent` (`POST /api/ingest/events`) is public (`"public": true` in `camis.json`), which is
Strapi's `auth: false`. On strapi-php the request runs with **every grant answered yes** and every
ownership scope lifted (`StrapiPublicRoute`). The handler is therefore the only authorization on
that path. camis' endpoint guard runs first on both targets: CORS for the two request headers, the
throttle per client address (`CAMIS_ENDPOINT_INGEST_EVENT_THROTTLE_PER_MINUTE`), the media type and
the 65,536-byte body cap. Then the handler, in this order, each refusal in Strapi's error body:

1. **415** unless the body is `application/json` (fetch) or `text/plain` (beacon), and for any
   `Content-Encoding` but `identity`. Strapi's body parser inflates gzip, deflate and br before the
   handler runs, so a compressed body would otherwise pass the cap on its compressed size; both
   targets refuse an encoded body alike.
2. **413** for a body over `INGEST_MAX_BODY_BYTES` (at most 65,536): its declared length, then the
   body itself (text by its bytes; on Strapi a body the JSON parser already decoded by the bytes of
   its JSON, which can only exceed what was sent for numbers in exponent form, which the SDK never
   sends). On strapi-php the body is read raw, at most one byte past the cap.
3. **400** for an invalid batch, the whole batch: the same rules as the SDK's `parseTrackingBatch`,
   held to the shared vectors in `packages/tracking/src/testing/batch-vectors.json` on both targets.
4. **404** when the key (the `X-Idg-Write-Key` header of a fetch, the body's `writeKey` of a beacon,
   never the URL) is unknown or its property is inactive. One query asks for both, and the answers
   are identical. No property id, owner id or other relation is ever taken from the body.
5. **403** when `Origin` is absent or not one of the property's `allowedOrigins` (compared exactly;
   the model refuses an origin a browser never sends, such as one with `:443`).

A header sent twice (`Origin` or `X-Idg-Write-Key`) depends on what the server hands the handler.
Node (Strapi) joins the values with `, `, and so do Apache and nginx in front of PHP; the joined
value matches no origin or key, so the request is refused (403 or 404). PHP's built-in server, the
one `pnpm contract:live` uses, keeps only the first value, so there the second is ignored. 6. **429** with `Retry-After` past `INGEST_KEY_RATE_PER_MINUTE` for the key, counted under the
property's id (in the cache on strapi-php, in bounded per-process memory on Strapi). 7. **202** with no body. Each accepted event becomes one Event row with `property` and `owner` from
the key's property; an event skipped (below) changes nothing in the answer.

**Database failures answer 503**, which the SDK retries with backoff (it retries any `5xx` and
`429`, and drops a batch on any other `4xx`); events stored before the failure are skipped as
repeats when the batch comes again. On both targets that holds for every database failure on this
route:

- in the handler: the key lookup, the per-key count (in strapi-php's cache, which `.env.example`
  puts in the database) and each event's store, logged as `IngestEvent: the database failed at the
<stage> (<error class>)`;
- on strapi-php, before the handler: camis' endpoint guard counts the per-address throttle in the
  same cache, and camis' error envelope (`StrapiErrors`) answers any `QueryException` 400
  "Validation failed". `app/Ingest/IngestDatabaseFailures.php`, registered from the protected
  `app/Providers/AppServiceProvider.php` (Laravel's own provider, which camis does not write), adds
  an exception renderer at boot, ahead of the one `StrapiErrors` adds during the request, that
  answers a `QueryException` or `PDOException` on `POST /api/ingest/events` 503, and stops Laravel
  from reporting it with its query; it logs `IngestEvent: the database failed before the handler
(<error class>)`. A broken or missing cache table, or an unreadable database file, is such a
  failure. On Strapi the throttle counts in memory, so nothing before the handler reads the
  database.

None of these logs the error's message, which holds the query and its bindings (the key, the
body's values), nor the body or headers. A deadlock between two batches on MySQL or PostgreSQL is
such a failure. Every other database failure on the API keeps camis' answer (400). Any other
unexpected error on the ingestion route answers 500, which the SDK also retries.

What is stored (`app/Ingest/IngestedEvent.php`, `src/ingest/normalise.ts`, held to the same
`cms/tests/fixtures/ingest-normalise-vectors.json`):

- `dedupeKey`: the SHA-256 of `<property id>:<event id>`, unique. A repeat is skipped. strapi-php
  relies on the unique index, each event in its own savepoint; Strapi has no unique index (camis
  does not generate one), so it serialises writes per `dedupeKey` within the process and reads
  before it creates, and when a create fails but the row is there afterwards (another process
  stored it, which Strapi's unique check refuses), it counts as a repeat, not a failure.
- `occurredAt = at + (now - sentAt)`. An event more than 25 hours back or 5 minutes ahead after
  that correction is skipped.
- `path` with only the query parameters named in the property's `allowedQueryParams`, in their
  order, and never a fragment; `referrerHost`: the referrer's host in lower case, or nothing for an
  IP address, a bare name such as `localhost`, or a port alone.
- `page_view` is always accepted and never keeps properties. Any other event is skipped unless the
  property's `allowedEvents` lists it, and only the property keys listed for it are kept.
- `sessionId` as sent, or nothing.

Never read, stored or logged: the caller's IP address, its User-Agent, cookies, the wire `user` id,
the write key (compared, never stored). The address exists only in camis' short-lived throttle
counter, keyed by a hash.

## The hook and the schedule

- `IssueIngestKey` (Property `beforeCreate`) returns `pk_` followed by 40 characters from a
  cryptographically secure generator (`Str::random()` in PHP, `crypto.randomInt` in Node), ignoring
  its input. The field is not required, so a create sends no key.
- `DropClientIngestKey` (Property's create and update routes) removes `ingestKey` from the body's
  `data` (camis' generated controllers refuse any other `data`, a multipart body's JSON text
  among them, with 400) and, on strapi-php, from the query
  string, before the controller validates it. A key is therefore never set, changed, cleared or
  probed through the content API on either target.
- `PurgeExpiredEvents` (daily) deletes, for each property, the events older than its
  `retentionDays`. It deletes in bulk, so no per-entry webhook or lifecycle runs. A property whose
  `retentionDays` is below 1 or not a whole number (only a row written past the model's 1 to 400)
  keeps every event, on both targets.

## Tests and type checking

- PHPUnit (`tests/Feature/Ingest`) runs in the live app on every `pnpm contract:live`
  (`scripts/live-backend.js`), with the two shared vector files passed by `TRACKING_BATCH_VECTORS`
  and `INGEST_NORMALISE_VECTORS`.
- Vitest (`cms/tests/ingest-*.test.ts`) tests the Strapi side against a fake document service, and
  `cms/tests/ingest-php-vectors.test.ts` runs `app/Ingest`'s validator and normaliser on the shared
  vectors with plain PHP (no Laravel app), so `pnpm test` and CI hold both targets to them.
- `cms/tsconfig.strapi.json` type-checks `src/` and `config/` as the generated Strapi project
  compiles them (CommonJS, the ES2020 library, `strict` off), as part of `pnpm typecheck`.
