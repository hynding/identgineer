<?php

declare(strict_types=1);

namespace App\Ingest;

use JsonException;
use stdClass;

/**
 * The tracking SDK's wire format (packages/tracking/src/wire-format.ts, parse-tracking-batch.ts),
 * restated in PHP. The shared vectors (packages/tracking/src/testing/batch-vectors.json) hold it, the
 * SDK's validator and the Strapi handler's to the same answers (tests/Feature/Ingest).
 *
 * JSON objects are decoded as stdClass, so an empty object and an empty list stay apart, and a
 * number is compared by value, as JavaScript sees it: 1.0 and 17E11 are whole numbers. json_decode
 * already refuses invalid UTF-8 and lone surrogates, which the SDK refuses as malformed strings.
 */
final class TrackingBatch
{
    public const WIRE_VERSION = 1;

    public const MAX_EVENTS_PER_BATCH = 500;

    public const MAX_BYTES = 65536;

    public const WRITE_KEY_PATTERN = '/\A[A-Za-z0-9_-]{16,128}\z/';

    private const MAX_PROPERTIES_PER_EVENT = 32;

    private const MAX_WIRE_STRING_LENGTH = 1024;

    private const MAX_PATH_LENGTH = 2048;

    private const MAX_TIMESTAMP = 8640000000000000;

    // A valid batch nests four deep (batch, events, event, properties); anything deeper is refused.
    private const MAX_DEPTH = 16;

    private const EVENT_NAME_PATTERN = '/\A[a-z][a-z0-9_]{0,63}\z/';

    private const IDENTIFIER_PATTERN = '/\A[A-Za-z0-9_-]{1,64}\z/';

    private const TOKEN_PATTERN = '/\A[A-Za-z0-9_-]{16,64}\z/';

    private const PATH_PATTERN = '/\A\/[!"$-~]*\z/';

    private const REFERRER_PATTERN = '/\Ahttps?:\/\/[A-Za-z0-9.:[\]-]{1,253}\z/';

    private const BATCH_KEYS = ['v', 'sentAt', 'transport', 'writeKey', 'events'];

    private const EVENT_KEYS = ['id', 'name', 'at', 'session', 'user', 'path', 'referrer', 'properties'];

    /**
     * The batch in a request body, refused above MAX_BYTES before it is decoded.
     *
     * @return array{sentAt: int, transport: string, writeKey: ?string, events: list<array{id: string, name: string, at: int, session: ?string, path: ?string, referrer: ?string, properties: ?array<string, string|int|float|bool>}>}
     *
     * @throws InvalidTrackingBatch
     */
    public static function parse(string $body): array
    {
        if (strlen($body) > self::MAX_BYTES) {
            throw new InvalidTrackingBatch('body: '.strlen($body).' bytes exceed the cap of '.self::MAX_BYTES.' bytes');
        }
        try {
            $decoded = json_decode($body, false, self::MAX_DEPTH, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new InvalidTrackingBatch('body: is not JSON');
        }

        return self::batch($decoded);
    }

    private static function reject(string $where, string $rule): never
    {
        throw new InvalidTrackingBatch($where.': '.$rule);
    }

    /** @return array<string, mixed> */
    private static function record(mixed $value, string $where): array
    {
        if (! $value instanceof stdClass) {
            self::reject($where, 'must be an object');
        }
        $fields = [];
        foreach (get_object_vars($value) as $key => $field) {
            // A key such as "0" comes back as an integer key.
            $fields[(string) $key] = $field;
        }

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $source
     * @param  list<string>  $allowed
     */
    private static function checkKeys(array $source, array $allowed, string $where): void
    {
        foreach (array_keys($source) as $key) {
            if (! in_array((string) $key, $allowed, true)) {
                self::reject(ltrim($where.'.'.$key, '.'), 'is not allowed');
            }
        }
    }

    private static function timestamp(mixed $value, string $where): int
    {
        if (is_float($value) && is_finite($value) && floor($value) === $value && $value >= 0 && $value <= self::MAX_TIMESTAMP) {
            return (int) $value;
        }
        if (is_int($value) && $value >= 0 && $value <= self::MAX_TIMESTAMP) {
            return $value;
        }
        self::reject($where, 'must be a whole number of milliseconds since the epoch');
    }

    private static function text(mixed $value, string $where, string $pattern, int $maxLength, string $rule): string
    {
        if (is_string($value) && mb_strlen($value, 'UTF-8') <= $maxLength && preg_match($pattern, $value) === 1) {
            return $value;
        }
        self::reject($where, $rule);
    }

    private static function propertyValue(mixed $value, string $where): string|int|float|bool
    {
        if (is_string($value)) {
            if (mb_strlen($value, 'UTF-8') <= self::MAX_WIRE_STRING_LENGTH) {
                return $value;
            }
            self::reject($where, 'must be a well-formed string of at most '.self::MAX_WIRE_STRING_LENGTH.' code points');
        }
        if (is_int($value) || is_bool($value)) {
            return $value;
        }
        if (is_float($value)) {
            return is_finite($value) ? $value : self::reject($where, 'must be a finite number');
        }
        self::reject($where, 'must be a string, number or boolean');
    }

    /** @return array<string, string|int|float|bool> */
    private static function properties(mixed $value, string $where): array
    {
        $source = self::record($value, $where);
        if (count($source) > self::MAX_PROPERTIES_PER_EVENT) {
            self::reject($where, 'has more than '.self::MAX_PROPERTIES_PER_EVENT.' properties');
        }
        $properties = [];
        foreach ($source as $key => $item) {
            self::text($key, $where.'.'.$key, self::EVENT_NAME_PATTERN, 64, 'is not a valid property key');
            $properties[$key] = self::propertyValue($item, $where.'.'.$key);
        }

        return $properties;
    }

    /** @return array{id: string, name: string, at: int, session: ?string, path: ?string, referrer: ?string, properties: ?array<string, string|int|float|bool>} */
    private static function event(mixed $value, string $where): array
    {
        $source = self::record($value, $where);
        self::checkKeys($source, self::EVENT_KEYS, $where);
        $optional = static fn (string $key, \Closure $parse): mixed => array_key_exists($key, $source) ? $parse($source[$key], $where.'.'.$key) : null;
        // Checked, never kept: the visitor's own id is not stored.
        $optional('user', static fn (mixed $item, string $at): string => self::text($item, $at, self::IDENTIFIER_PATTERN, 64, 'must match [A-Za-z0-9_-]{1,64}'));
        $path = $optional('path', static fn (mixed $item, string $at): string => self::text($item, $at, self::PATH_PATTERN, self::MAX_PATH_LENGTH, 'must be an origin-relative path with no fragment'));
        $referrer = $optional('referrer', static fn (mixed $item, string $at): string => self::text($item, $at, self::REFERRER_PATTERN, 260, 'must be an origin and nothing else'));
        $session = $optional('session', static fn (mixed $item, string $at): string => self::text($item, $at, self::TOKEN_PATTERN, 64, 'must be 16 to 64 base64url characters'));
        $properties = $optional('properties', static fn (mixed $item, string $at): array => self::properties($item, $at));

        return [
            'id' => self::text($source['id'] ?? null, $where.'.id', self::TOKEN_PATTERN, 64, 'must be 16 to 64 base64url characters'),
            'name' => self::text($source['name'] ?? null, $where.'.name', self::EVENT_NAME_PATTERN, 64, 'must match [a-z][a-z0-9_]{0,63}'),
            'at' => self::timestamp($source['at'] ?? null, $where.'.at'),
            'session' => $session,
            'path' => $path,
            'referrer' => $referrer,
            'properties' => $properties,
        ];
    }

    /** @return array{sentAt: int, transport: string, writeKey: ?string, events: list<array{id: string, name: string, at: int, session: ?string, path: ?string, referrer: ?string, properties: ?array<string, string|int|float|bool>}>} */
    private static function batch(mixed $input): array
    {
        $source = self::record($input, 'batch');
        self::checkKeys($source, self::BATCH_KEYS, 'batch');
        $version = $source['v'] ?? null;
        if ($version !== self::WIRE_VERSION && $version !== (float) self::WIRE_VERSION) {
            self::reject('batch.v', 'must be '.self::WIRE_VERSION);
        }
        $sentAt = self::timestamp($source['sentAt'] ?? null, 'batch.sentAt');
        $transport = $source['transport'] ?? null;
        if ($transport !== 'fetch' && $transport !== 'beacon') {
            self::reject('batch.transport', 'must be fetch or beacon');
        }
        $list = $source['events'] ?? null;
        if (! is_array($list) || count($list) < 1 || count($list) > self::MAX_EVENTS_PER_BATCH) {
            self::reject('batch.events', 'must be a list of 1 to '.self::MAX_EVENTS_PER_BATCH.' events');
        }
        $events = [];
        $seen = [];
        foreach (array_values($list) as $index => $item) {
            $event = self::event($item, 'events['.$index.']');
            if (isset($seen[$event['id']])) {
                self::reject('events['.$index.'].id', 'is a duplicate in the batch');
            }
            $seen[$event['id']] = true;
            $events[] = $event;
        }
        $writeKey = array_key_exists('writeKey', $source)
            ? self::text($source['writeKey'], 'batch.writeKey', self::WRITE_KEY_PATTERN, 128, 'must match [A-Za-z0-9_-]{16,128}')
            : null;
        if (($transport === 'beacon') !== ($writeKey !== null)) {
            self::reject('batch.writeKey', 'must be present in a beacon and absent in a fetch batch');
        }

        return ['sentAt' => $sentAt, 'transport' => $transport, 'writeKey' => $writeKey, 'events' => $events];
    }
}
