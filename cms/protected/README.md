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

1. **415** unless the body is `application/json` (fetch) or `text/plain` (beacon).
2. **413** for a body over `INGEST_MAX_BODY_BYTES` (at most 65,536), before it is parsed.
3. **400** for an invalid batch, the whole batch: the same rules as the SDK's `parseTrackingBatch`,
   held to the shared vectors in `packages/tracking/src/testing/batch-vectors.json` on both targets.
4. **404** when the key (the `X-Idg-Write-Key` header of a fetch, the body's `writeKey` of a beacon,
   never the URL) is unknown or its property is inactive. One query asks for both, and the answers
   are identical. No property id, owner id or other relation is ever taken from the body.
5. **403** when `Origin` is absent or not one of the property's `allowedOrigins`.
6. **429** with `Retry-After` past `INGEST_KEY_RATE_PER_MINUTE` for the key, counted under the
   property's id (in the cache on strapi-php, in bounded per-process memory on Strapi).
7. **202** with no body. Each accepted event becomes one Event row with `property` and `owner` from
   the key's property; an event skipped (below) changes nothing in the answer.

What is stored (`app/Ingest/IngestedEvent.php`, `src/ingest/normalise.ts`, held to the same
`cms/tests/fixtures/ingest-normalise-vectors.json`):

- `dedupeKey`: the SHA-256 of `<property id>:<event id>`, unique. A repeat is skipped. strapi-php
  relies on the unique index, each event in its own savepoint; Strapi has no unique index (camis
  does not generate one), so it serialises writes per `dedupeKey` within the process and reads
  before it creates.
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
  `data` (an object, or a multipart body's JSON text on Strapi) and, on strapi-php, from the query
  string, before the controller validates it. A key is therefore never set, changed, cleared or
  probed through the content API on either target.
- `PurgeExpiredEvents` (daily) deletes, for each property, the events older than its
  `retentionDays`. It deletes in bulk, so no per-entry webhook or lifecycle runs.

## Tests and type checking

- PHPUnit (`tests/Feature/Ingest`) runs in the live app on every `pnpm contract:live`
  (`scripts/live-backend.js`), with the two shared vector files passed by `TRACKING_BATCH_VECTORS`
  and `INGEST_NORMALISE_VECTORS`.
- Vitest (`cms/tests/ingest-*.test.ts`) tests the Strapi side against a fake document service.
- `cms/tsconfig.strapi.json` type-checks `src/` and `config/` as the generated Strapi project
  compiles them (CommonJS, the ES2020 library, `strict` off), as part of `pnpm typecheck`.
