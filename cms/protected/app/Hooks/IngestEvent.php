<?php

declare(strict_types=1);

namespace App\Hooks;

use App\Hooks\Contracts\IngestEventEndpoint;
use App\Ingest\IngestedEvent;
use App\Ingest\IngestPolicy;
use App\Ingest\InvalidTrackingBatch;
use App\Ingest\TrackingBatch;
use App\Models\Event;
use App\Models\Property;
use App\Support\StrapiError;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Ring 2 endpoint — hand-written, from the seed camis wrote. POST /api/ingest/events, public: no
 * caller is authenticated and every grant is answered yes on this route (StrapiPublicRoute), so this
 * handler is its only authorization. camis' guard has already refused a caller over the endpoint's
 * rate, another media type and a body over 65536 bytes (config/camis-endpoints.php).
 *
 * Checks in this order, each refusal in Strapi's error body: media type (415), body size against
 * INGEST_MAX_BODY_BYTES (413, before decoding), the batch (400, whole batch), the key (404, alike for
 * an unknown and an inactive one: one query asks for both), the Origin header against the property's
 * allowed origins (403), the key's rate (429 with Retry-After). Then each accepted event is stored
 * against the key's own property and owner, and the answer is 202 with no body. An event not
 * allowed, outside the time window or already stored is skipped.
 *
 * Never read: the caller's address, its User-Agent, cookies. The write key is compared, never
 * stored, and the per-key count is kept under the property's id.
 */
final class IngestEvent implements IngestEventEndpoint
{
    private const ACCEPTED_TYPES = ['application/json', 'text/plain'];

    public function handle(Request $request): mixed
    {
        $type = strtolower(trim(explode(';', (string) $request->headers->get('Content-Type', ''), 2)[0]));
        if (! in_array($type, self::ACCEPTED_TYPES, true)) {
            throw new StrapiError(415, 'UnsupportedMediaTypeError', 'The request body must be application/json or text/plain');
        }
        $body = self::boundedBody($request, max(1, (int) config('ingest.max_body_bytes', TrackingBatch::MAX_BYTES)));
        try {
            $batch = TrackingBatch::parse($body);
        } catch (InvalidTrackingBatch) {
            throw StrapiError::validation('Invalid batch');
        }
        $writeKey = $batch['transport'] === 'beacon' ? $batch['writeKey'] : $request->headers->get('X-Idg-Write-Key');
        $property = is_string($writeKey) && preg_match(TrackingBatch::WRITE_KEY_PATTERN, $writeKey) === 1
            ? Property::query()->where('ingest_key', $writeKey)->where('active', true)->with(IngestPolicy::RELATIONS)->first()
            : null;
        if (! $property instanceof Property) {
            throw new StrapiError(404, 'NotFoundError', 'Not Found');
        }
        $policy = IngestPolicy::fromProperty($property);
        if (! in_array($request->headers->get('Origin'), $policy->allowedOrigins, true)) {
            throw new StrapiError(403, 'ForbiddenError', 'Forbidden');
        }
        self::limitKey($property);
        self::store($batch, $property, $policy);

        return new Response('', 202);
    }

    /** The body, refused (413) when it declares or holds more than $max bytes; never read past $max + 1. */
    private static function boundedBody(Request $request, int $max): string
    {
        $declared = trim((string) $request->headers->get('Content-Length', ''));
        if (ctype_digit($declared) && (strlen(ltrim($declared, '0')) > 18 || (int) $declared > $max)) {
            throw new StrapiError(413, 'PayloadTooLargeError', 'Entity too large');
        }
        $stream = $request->getContent(true);
        $body = '';
        while (strlen($body) <= $max && ! feof($stream)) {
            $chunk = fread($stream, max(1, min(8192, $max + 1 - strlen($body))));
            if ($chunk === false || $chunk === '') {
                break;
            }
            $body .= $chunk;
        }
        if (strlen($body) > $max) {
            throw new StrapiError(413, 'PayloadTooLargeError', 'Entity too large');
        }

        return $body;
    }

    /** Counts the request under the property's id, in Laravel's cache, refused ones included. */
    private static function limitKey(Property $property): void
    {
        $perMinute = max(1, (int) config('ingest.key_rate_per_minute', 3000));
        $key = 'ingest-key|'.$property->getKey();
        if (RateLimiter::hit($key, 60) > $perMinute) {
            throw new ThrottleRequestsException('Too Many Attempts.', null, [
                'Retry-After' => max(1, RateLimiter::availableIn($key)),
            ]);
        }
    }

    /**
     * One transaction, a savepoint per event: an event whose dedupeKey is stored already, by an
     * earlier request or one running now, fails on the unique index and is skipped alone.
     *
     * @param  array{sentAt: int, transport: string, writeKey: ?string, events: list<array{id: string, name: string, at: int, session: ?string, path: ?string, referrer: ?string, properties: ?array<string, string|int|float|bool>}>}  $batch
     */
    private static function store(array $batch, Property $property, IngestPolicy $policy): void
    {
        $nowMs = (int) floor(microtime(true) * 1000);
        $propertyId = (int) $property->getKey();
        DB::transaction(static function () use ($batch, $property, $propertyId, $policy, $nowMs): void {
            foreach ($batch['events'] as $event) {
                $row = IngestedEvent::row($event, $propertyId, $batch['sentAt'], $nowMs, $policy);
                if ($row === null) {
                    continue;
                }
                try {
                    DB::transaction(static fn (): Event => Event::query()->create($row + [
                        'property_id' => $propertyId,
                        'owner_id' => $property->owner_id,
                    ]));
                } catch (UniqueConstraintViolationException) {
                    // Stored already: a repeat of an event is accepted and skipped.
                }
            }
        });
    }
}
