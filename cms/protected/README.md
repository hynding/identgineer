# protected/

Hand-written code that camis must never overwrite. `camis build` mirrors this directory into
**every** target's output after generating it (`cms/generated/strapi` and
`cms/generated/strapi-php`), so a file here wins over the generated or seeded file at the same path.
`cms/generated/` itself is git-ignored and disposable; anything that must survive a rebuild lives
here. This README is copied into both outputs too.

camis has one protected directory for all targets, so a PHP file placed here is also copied into
the Strapi project and a TypeScript file into the Laravel app. Both are inert in the other target.
Keep each language under the path its own target expects:

| What                               | strapi-php (Laravel) path          | Strapi path                                            |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `IngestEvent` endpoint             | `app/Hooks/IngestEvent.php`        | `src/api/event/controllers/ingest-event.ts`            |
| `RecordConsent` endpoint           | `app/Hooks/RecordConsent.php`      | `src/api/consent-record/controllers/record-consent.ts` |
| `IssueIngestKey` hook (Property)   | `app/Hooks/IssueIngestKey.php`     | `src/hooks/issue-ingest-key.ts`                        |
| `PurgeExpiredEvents` schedule      | `app/Hooks/PurgeExpiredEvents.php` | `src/cron/purge-expired-events.ts`                     |
| Extra API routes (strapi-php only) | `routes/api-custom.php`            | —                                                      |

Each path above is seeded by camis as a stub the first time it builds, implementing a generated
contract (`app/Hooks/Contracts/*.php`, `src/hooks/contracts/*.ts`). Copy a stub here before
filling it in; editing it under `cms/generated/` would be lost on the next clean build.

Nothing is implemented here yet. Until it is, the seeded stubs are safe: the endpoints answer
`{ "data": null }` and write nothing, the purge does nothing, and `IssueIngestKey` passes the
client's key through (it must still match `^pk_[A-Za-z0-9]{19,61}$` and be unique). The tracking
domain (Feature 9) implements them.

## Rules for the ingestion endpoints

`IngestEvent` and `RecordConsent` are public (`"public": true` in `camis.json`), which is Strapi's
`auth: false`. On strapi-php the request runs with **every grant answered yes** and every
ownership scope lifted (`StrapiPublicRoute`). The handler is therefore the only authorization on
that path, and must:

1. Accept `POST` with a JSON or `text/plain` body (so `navigator.sendBeacon` works without a CORS
   preflight), and refuse a body over `INGEST_MAX_BODY_BYTES` before parsing it.
2. Look up the property by `ingestKey` only, and refuse (404, same body as an unknown key) when it
   is unknown or `active` is false. Never take a property id, an owner id or any other relation
   from the body.
3. Refuse when the `Origin` header is absent or is not one of the property's `allowedOrigins`.
4. Rate limit per property key and per client address (`INGEST_RATE_PER_MINUTE`), keeping the
   address only in the limiter's short-lived counter, never in a row or a log line.
5. Validate every field against `camis.json` (lengths and patterns) and refuse unknown fields.
   Reduce a full URL to `path` without query string or fragment, and a referrer URL to its host.
   Bound `properties` to `INGEST_MAX_PROPERTIES_BYTES` of flat string, number or boolean values.
6. Store `property` and `owner` from the looked-up property (`owner` is denormalised so the
   owner's read grant can be checked; see `cms/README.md`).
7. For events, require the client's consent `subjectId` and drop the event unless that subject's
   latest consent record on the property grants `analytics` and is not withdrawn. The subject id
   is checked, never stored on the event, so events and consent records stay unlinked.
8. Answer `202` with no body. Never echo stored data; the endpoints have no read side.
9. Never write an IP address, a full user agent, cookies or any contact detail anywhere.

`IssueIngestKey` must return `pk_` followed by at least 32 characters from a cryptographically
secure generator (`Str::random()` in PHP, `crypto.randomInt` in Node), ignoring its input.
`PurgeExpiredEvents` deletes events older than their property's `retentionDays`.
